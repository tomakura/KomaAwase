// The notifications due at a set minute (class reminders, homework, the 20:00 one) go out when
// that minute begins. The every-minute cron started a minute or more late, so a Durable
// Object's alarm wakes them instead (MinuteClock in worker/entry.js): each alarm sets the next
// one first, then sends its minute. The cron only makes sure an alarm is set. After a stop, or a
// minute whose lookup failed, the minutes missed are sent too, a few at most (a minute sent
// twice only shows its notifications again in place); what is out of date by then is dropped
// (deliver).
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { METRICS, countMetric } from './metrics';
import { sendPlanEve } from './plan-eve';
import type { PushEnv } from './push-queue';
import { sendDueReminders } from './reminders';
import { sendTaskReminders } from './task-reminders';

export const MINUTE = 60_000;
// The minutes looked back over after a stop, the current one included
export const CATCH_UP = 5;

/** The start of the minute after the one `now` falls in, for the next alarm */
export const nextMinute = (now: number) => Math.floor(now / MINUTE) * MINUTE + MINUTE;

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
 * through the queue. Never throws.
 */
export async function runMinute(env: PushEnv, minute: number, now = Date.now()) {
	const late = Math.max(0, now - minute);
	await countMetric(env.DB, METRICS.notifyMinute, 1, late, now);
	if (late >= 10_000) await countMetric(env.DB, METRICS.notifyLate, 1, 0, now);
	const results = await Promise.allSettled([
		sendDueReminders(env, minute, undefined, true),
		sendPlanEve(env, minute, undefined, true),
		sendTaskReminders(env, minute, undefined, true)
	]);
	for (const r of results) if (r.status === 'rejected') console.error('notifications for the minute failed', r.reason);
	return results.every((r) => r.status === 'fulfilled');
}
