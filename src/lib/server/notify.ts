import { eq, inArray } from 'drizzle-orm';
import { isQuiet, wants, type NotifyKind } from '$lib/notify';
import { tokyoTime } from '$lib/time';
import type { Db } from './db';
import { pushSubscriptions, users } from './db/schema';
import { deliver } from './push-queue';

// `badge`: the number to show on the app's icon, for when the app isn't open
export type PushMessage = { title: string; body?: string; url: string; tag?: string; badge?: number };

export function pushEnabled(env: Env | undefined) {
	return !!env?.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
}

/**
 * Sends the message to the browsers of these people that want this kind; more than one run of
 * the Worker can send go through the push queue (push-queue.ts). Subscriptions the browser
 * has let go (404/410) are removed. Failures are logged, never thrown.
 */
export async function notify(env: Env, db: Db, userIds: string[], kind: NotifyKind | null, message: PushMessage, options: { ignoreQuiet?: boolean } = {}) {
	if (!pushEnabled(env) || !userIds.length) return;
	try {
		// D1 takes at most 100 bound values per query
		const ids = [...new Set(userIds)];
		const rows = [];
		for (let i = 0; i < ids.length; i += 90) {
			rows.push(
				...(await db
					.select({
						id: pushSubscriptions.id,
						endpoint: pushSubscriptions.endpoint,
						p256dh: pushSubscriptions.p256dh,
						auth: pushSubscriptions.auth,
						settings: users.notify
					})
					.from(pushSubscriptions)
					.innerJoin(users, eq(users.id, pushSubscriptions.userId))
					.where(inArray(pushSubscriptions.userId, ids.slice(i, i + 90))))
			);
		}
		// kind null: not one a person can turn off (a test, a message to the admins). In the quiet
		// hours a person chose nothing goes, except the test from the settings page.
		const expires = Date.now() + 24 * 60 * 60 * 1000;
		const minutes = tokyoTime(Date.now()).minutes;
		const items = rows
			.filter((r) => (!kind || wants(r.settings, kind)) && (options.ignoreQuiet || !isQuiet(r.settings?.quiet, minutes)))
			.map((r) => ({ deviceId: r.id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, message, expires }));
		await deliver(env, items);
	} catch (e) {
		console.error('notify failed', e);
	}
}

/** The same, after the response has gone out, so the page never waits on push services. */
export function notifyLater(platform: App.Platform | undefined, db: Db, userIds: string[], kind: NotifyKind, message: PushMessage) {
	if (!platform || !pushEnabled(platform.env)) return;
	platform.ctx.waitUntil(notify(platform.env, db, userIds, kind, message));
}
