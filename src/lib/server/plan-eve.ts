// Tells people at 20:00 what is due or happens the next day, when they haven't turned it off
// (notify kind planEve). Like the class reminders it doesn't go through SvelteKit: the cron
// that runs every minute calls it. To stay under the Worker's outside-request limit, the people
// are spread over the ten minutes from 20:00, each in the same one every day (eveSlot), and
// what one minute can't send goes through the push queue (push-queue.ts).
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { isQuiet, wants } from '../notify';
import { EVE_MINUTES, eveMessage, eveSlot, type EveItem } from '../plan-eve';
import { addDays, tokyoTime } from '../time';
import { sendPush } from './push';
import { deliver, type PushEnv } from './push-queue';

const EVE_START = 20 * 60;

type Row = EveItem & { userId: string; notify: string | null };
type Device = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

// A course's name as the timetable shows it: the shared course's when it is synced
const COURSE = `coalesce((SELECT sc.title FROM shared_courses sc WHERE c.sync_mode = 'synced' AND sc.id = c.shared_course_id), c.title)`;

// Homework not done and due on the day, and events on the day, of everyone with a notification
// turned on for the device. Parameters: date (twice).
const DUE = `
SELECT t.user_id AS userId, u.notify AS notify, 'task' AS kind, n.body AS title, NULL AS start, NULL AS place, ${COURSE} AS course
FROM course_notes n
JOIN courses c ON c.id = n.course_id
JOIN timetables t ON t.id = c.timetable_id AND t.archived = 0
JOIN users u ON u.id = t.user_id
WHERE n.kind = 'task' AND n.done = 0 AND n.due = ?
UNION ALL
SELECT e.user_id, u.notify, 'event', e.title, e.start_time, e.place, ${COURSE}
FROM events e
JOIN users u ON u.id = e.user_id
LEFT JOIN courses c ON c.id = e.course_id
WHERE e.date = ?`;

/** Sends this minute's share. Returns how many notifications it tried to send. */
export async function sendPlanEve(env: PushEnv, scheduledTime: number, send: typeof sendPush = sendPush, sendAt?: number) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
	const now = tokyoTime(scheduledTime);
	const slot = Math.floor(now.minutes) - EVE_START;
	if (slot < 0 || slot >= EVE_MINUTES) return 0;

	const tomorrow = addDays(now.date, 1);
	const { results } = await env.DB.prepare(DUE).bind(tomorrow, tomorrow).all<Row>();
	const byUser = new Map<string, EveItem[]>();
	for (const r of results) {
		if (eveSlot(r.userId) !== slot) continue;
		const settings = r.notify ? JSON.parse(r.notify) : null;
		if (!wants(settings, 'planEve') || isQuiet(settings?.quiet, now.minutes)) continue;
		byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
	}
	if (!byUser.size) return 0;

	// D1 takes at most 100 bound values per query
	const ids = [...byUser.keys()];
	const devices: Device[] = [];
	for (let i = 0; i < ids.length; i += 90) {
		const part = ids.slice(i, i + 90);
		const { results: rows } = await env.DB.prepare(
			`SELECT id, user_id AS userId, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${part.map(() => '?').join(', ')})`
		)
			.bind(...part)
			.all<Device>();
		devices.push(...rows);
	}
	if (!devices.length) return 0;

	// Still worth sending until midnight
	const expires = scheduledTime + (24 * 60 - Math.floor(now.minutes)) * 60_000;
	const items = devices.map((d) => ({
		deviceId: d.id,
		endpoint: d.endpoint,
		p256dh: d.p256dh,
		auth: d.auth,
		message: eveMessage(byUser.get(d.userId) ?? [], tomorrow),
		expires
	}));
	const { sent, queued } = await deliver(env, items, send, sendAt);
	console.log(`plan eve: sent ${sent}, queued ${queued}`);
	return sent + queued;
}
