import { eq, inArray } from 'drizzle-orm';
import type { NotifyKind } from '$lib/notify';
import type { Db } from './db';
import { pushSubscriptions, users } from './db/schema';
import { PUSH_SUBJECT, sendPush } from './push';

// The Free plan allows 50 outside requests per invocation; the rest of the work needs a few
const SENDS_MAX = 40;

// `badge`: the number to show on the app's icon, for when the app isn't open
export type PushMessage = { title: string; body?: string; url: string; tag?: string; badge?: number };

export function pushEnabled(env: Env | undefined) {
	return !!env?.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
}

/**
 * Sends the message to the browsers of these people that want this kind. Subscriptions the
 * browser has let go (404/410) are removed. Failures are logged, never thrown.
 */
export async function notify(env: Env, db: Db, userIds: string[], kind: NotifyKind | null, message: PushMessage) {
	if (!pushEnabled(env) || !userIds.length) return;
	try {
		const rows = await db
			.select({
				id: pushSubscriptions.id,
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth,
				settings: users.notify
			})
			.from(pushSubscriptions)
			.innerJoin(users, eq(users.id, pushSubscriptions.userId))
			.where(inArray(pushSubscriptions.userId, [...new Set(userIds)].slice(0, 90)));
		// kind null: a test from the settings page, which always goes
		const wanted = rows.filter((r) => !kind || r.settings?.[kind] !== false).slice(0, SENDS_MAX);
		const keys = { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! };
		const gone: string[] = [];
		await Promise.all(
			wanted.map(async (r) => {
				try {
					if ((await sendPush(r, message, keys, PUSH_SUBJECT)) === 'gone') gone.push(r.id);
				} catch (e) {
					console.error('push failed', e);
				}
			})
		);
		if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
	} catch (e) {
		console.error('notify failed', e);
	}
}

/** The same, after the response has gone out, so the page never waits on push services. */
export function notifyLater(platform: App.Platform | undefined, db: Db, userIds: string[], kind: NotifyKind, message: PushMessage) {
	if (!platform || !pushEnabled(platform.env)) return;
	platform.ctx.waitUntil(notify(platform.env, db, userIds, kind, message));
}
