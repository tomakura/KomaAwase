// Sending notifications to many phones at once. One run of the Worker may make only 50 outside
// requests on the Free plan, so a run sends up to SENDS_MAX itself and hands the rest to the
// push queue (wrangler.jsonc) in parts of SENDS_MAX, each sent by a run of its own
// (worker/entry.js). A part that fails is tried again a few times, only the phones that
// failed, and nothing is sent once it is out of date (each phone's `expires`). Sending a part twice only
// shows the notification again in its place, since notifications of one thing share a tag.
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { METRICS, countMetric } from './metrics';
import { PUSH_SUBJECT, sendPush } from './push';

/** The part of a D1 database this needs, so a test can stand in for it */
export type D1Like = {
	prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } };
};

export type PushQueue = { send(body: PushPart, options?: { delaySeconds?: number }): Promise<unknown> };

export type PushEnv = { DB: D1Like; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; PUSH_QUEUE?: PushQueue };

// One phone, what to show on it, and the time after which that is too late to send
export type PushItem = { deviceId: string; endpoint: string; p256dh: string; auth: string; message: object; expires: number };
// What a queue message carries: the phones, and how many times it has been tried
export type PushPart = { items: PushItem[]; attempt: number };

// The Free plan allows 50 outside requests per invocation; the rest of the work needs a few
export const SENDS_MAX = 40;
const ATTEMPTS_MAX = 3;
const RETRY_SECONDS = 60;

/**
 * Sends to these phones and returns the ones it could not reach. A phone that has dropped its
 * subscription (404/410) is removed; nothing here throws.
 */
async function sendNow(env: PushEnv, items: PushItem[], send: typeof sendPush) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !items.length) return [];
	const keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
	const gone: string[] = [];
	const failed: PushItem[] = [];
	const ok: string[] = [];
	await Promise.all(
		items.map(async (item) => {
			try {
				const result = await send(item, item.message, keys, PUSH_SUBJECT);
				if (result === 'gone') gone.push(item.deviceId);
				else if (result === 'failed') failed.push(item);
				else ok.push(item.deviceId);
			} catch (e) {
				console.error('push failed', e);
				failed.push(item);
			}
		})
	);
	if (gone.length) {
		try {
			await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(', ')})`)
				.bind(...gone)
				.run();
		} catch (e) {
			console.error('push: removing dropped phones failed', e);
		}
	}
	// For 通知 → 届かないときは: when each phone was last reached, or last not
	const now = Date.now();
	for (const [column, ids] of [
		['last_ok_at', ok],
		['last_failed_at', failed.map((f) => f.deviceId)]
	] as const) {
		if (!ids.length) continue;
		try {
			await env.DB.prepare(`UPDATE push_subscriptions SET ${column} = ? WHERE id IN (${ids.map(() => '?').join(', ')})`)
				.bind(now, ...ids)
				.run();
		} catch (e) {
			console.error('push: recording the result failed', e);
		}
	}
	await countMetric(env.DB, METRICS.pushOk, ok.length, 0, now);
	await countMetric(env.DB, METRICS.pushFailed, failed.length, 0, now);
	return failed;
}

async function enqueue(env: PushEnv, items: PushItem[], attempt: number, delaySeconds?: number) {
	if (!items.length) return 0;
	if (!env.PUSH_QUEUE) {
		console.warn(`push: ${items.length} not sent (no queue)`);
		return 0;
	}
	for (let i = 0; i < items.length; i += SENDS_MAX) {
		await env.PUSH_QUEUE.send({ items: items.slice(i, i + SENDS_MAX), attempt }, delaySeconds ? { delaySeconds } : undefined);
	}
	return items.length;
}

/**
 * Sends a message to each phone: the first SENDS_MAX now, the rest through the queue. The
 * ones that fail now are tried again through the queue too. Returns how many it sent now and
 * how many it queued. With `at` still a second or more away, all of them go through the queue,
 * held until then.
 */
export async function deliver(env: PushEnv, all: PushItem[], send: typeof sendPush = sendPush, at?: number) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !all.length) return { sent: 0, queued: 0 };
	const wait = at === undefined ? 0 : Math.floor((at - Date.now()) / 1000);
	// How many are held in the queue; if queueing stops partway, the rest are sent now instead
	let held = 0;
	if (wait >= 1 && env.PUSH_QUEUE) {
		try {
			for (; held < all.length; held += SENDS_MAX) {
				await env.PUSH_QUEUE.send({ items: all.slice(held, held + SENDS_MAX), attempt: 1 }, { delaySeconds: wait });
			}
			return { sent: 0, queued: all.length };
		} catch (e) {
			// Better early than not at all
			console.error('push: queueing for later failed', e);
		}
	}
	const items = all.slice(held);
	let queued = held;
	try {
		queued += await enqueue(env, items.slice(SENDS_MAX), 1);
	} catch (e) {
		console.error('push: queueing failed', e);
	}
	const now = items.slice(0, SENDS_MAX);
	const failed = await sendNow(env, now, send);
	try {
		await enqueue(env, failed, 2, RETRY_SECONDS);
	} catch (e) {
		console.error('push: queueing a retry failed', e);
	}
	return { sent: now.length, queued };
}

/** One part from the queue: sent unless it is out of date, its failures queued again a few times */
export async function sendPart(env: PushEnv, part: PushPart, now = Date.now(), send: typeof sendPush = sendPush) {
	if (!Array.isArray(part?.items)) return 0;
	const items = part.items.slice(0, SENDS_MAX).filter((item) => now <= item.expires);
	const failed = await sendNow(env, items, send);
	if (failed.length && part.attempt < ATTEMPTS_MAX) await enqueue(env, failed, part.attempt + 1, RETRY_SECONDS);
	else if (failed.length) console.warn(`push: gave up on ${failed.length}`);
	return items.length;
}
