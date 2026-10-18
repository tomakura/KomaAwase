// The notifications due at a set minute (class reminders, homework, the 20:00 one) go out when
// that minute begins. The every-minute cron started a minute or more late, so a Durable
// Object's alarm wakes them instead (MinuteClock in worker/entry.js): each alarm sets the next
// one first, then sends its minute. The cron only makes sure an alarm is set. After a stop, or a
// minute whose lookup failed, the minutes missed are sent too, a few at most (a minute sent
// twice only shows its notifications again in place); what is out of date by then is dropped
// (deliver).
// iPhones get theirs through Apple, which took about 20 seconds longer than Android (2026-10-08),
// so those go out APPLE_EARLY before the minute, by an alarm of their own; the minute's own alarm
// then sends the iPhones only what was not sent early (made or changed in between, or a lookup
// that failed).
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { METRICS, countMetric } from './metrics';
import { sendPlanEve } from './plan-eve';
import type { DeliverOptions, PushEnv, PushItem } from './push-queue';
import { sendDueReminders } from './reminders';
import { sendTaskReminders } from './task-reminders';

export const MINUTE = 60_000;
// The minutes looked back over after a stop, the current one included
export const CATCH_UP = 5;

export const APPLE_EARLY = 15_000;

/** The start of the minute after the one `now` falls in */
export const nextMinute = (now: number) => Math.floor(now / MINUTE) * MINUTE + MINUTE;

/** Whether `now` is in the part of a minute when the next minute's iPhones are sent */
export const isEarly = (now: number) => now >= nextMinute(now) - APPLE_EARLY;

/** The next alarm: the one for the next minute's iPhones, or the next minute itself */
export const nextAlarm = (now: number) => (isEarly(now) ? nextMinute(now) : nextMinute(now) - APPLE_EARLY);

/** Whether a phone gets its notifications through Apple (an iPhone or iPad) */
export function isApple(endpoint: string) {
	try {
		return new URL(endpoint).hostname.endsWith('.push.apple.com');
	} catch {
		return false;
	}
}

// One notification on one phone, as it reads (one changed since is sent again, in its place)
const keyOf = (item: PushItem) => JSON.stringify([item.deviceId, item.message]);

async function sendAll(env: PushEnv, minute: number, options: DeliverOptions) {
	const results = await Promise.allSettled([
		sendDueReminders(env, minute, undefined, options),
		sendPlanEve(env, minute, undefined, options),
		sendTaskReminders(env, minute, undefined, options)
	]);
	for (const r of results) if (r.status === 'rejected') console.error('notifications for the minute failed', r.reason);
	return results.every((r) => r.status === 'fulfilled');
}

/**
 * The minutes to send now: the one `now` falls in, and the ones after `last` that were missed.
 * None when `last` is already this minute (an alarm a moment early, or run twice).
 */
export function minutesDue(last: number | undefined, now: number) {
	const current = Math.floor(now / MINUTE) * MINUTE;
	const from = last === undefined ? current : Math.max(last + MINUTE, current - (CATCH_UP - 1) * MINUTE);
	const out: number[] = [];
	for (let m = from; m <= current; m += MINUTE) out.push(m);
	return out;
}

/**
 * Sends one minute's notifications, and counts how late that was. Returns false when looking
 * them up failed (D1), so the minute is tried again with the next alarm; sending itself retries
 * through the queue. Never throws. `sentEarly` is what went to iPhones early (runEarly).
 */
export async function runMinute(env: PushEnv, minute: number, now = Date.now(), sentEarly?: Set<string>) {
	const late = Math.max(0, now - minute);
	await countMetric(env.DB, METRICS.notifyMinute, 1, late, now);
	if (late >= 10_000) await countMetric(env.DB, METRICS.notifyLate, 1, 0, now);
	return sendAll(env, minute, { dropLate: true, pick: sentEarly?.size ? (item) => !sentEarly.has(keyOf(item)) : undefined });
}

/** Sends a minute's notifications to the iPhones, before it begins. Returns what it sent. */
export async function runEarly(env: PushEnv, minute: number) {
	const sent: string[] = [];
	await sendAll(env, minute, { dropLate: true, pick: (item) => isApple(item.endpoint) && !!sent.push(keyOf(item)) });
	return sent;
}
