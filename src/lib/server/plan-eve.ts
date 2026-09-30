// Tells people at 20:00 what is due or happens the next day, when they haven't turned it off
// (notify kind planEve). Like the class reminders it doesn't go through SvelteKit: the cron
// that runs every minute calls it. To stay under the Worker's outside-request limit, the people
// are spread over the ten minutes from 20:00, each in the same one every day (eveSlot).
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { EVE_MINUTES, eveMessage, eveSlot, type EveItem } from '../plan-eve';
import { addDays, tokyoTime } from '../time';
import { PUSH_SUBJECT, sendPush } from './push';
import type { D1Like } from './reminders';

const SENDS_MAX = 40;
const EVE_START = 20 * 60;

type Row = EveItem & { userId: string; notify: string | null };
type Device = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

// Homework not done and due on the day, and events on the day, of everyone with a notification
// turned on for the device. Parameters: date (twice).
const DUE = `
SELECT t.user_id AS userId, u.notify AS notify, 'task' AS kind, n.body AS title, NULL AS start, NULL AS place, c.title AS course
FROM course_notes n
JOIN courses c ON c.id = n.course_id
JOIN timetables t ON t.id = c.timetable_id AND t.archived = 0
JOIN users u ON u.id = t.user_id
WHERE n.kind = 'task' AND n.done = 0 AND n.due = ?
UNION ALL
SELECT e.user_id, u.notify, 'event', e.title, e.start_time, e.place, c.title
FROM events e
JOIN users u ON u.id = e.user_id
LEFT JOIN courses c ON c.id = e.course_id
WHERE e.date = ?`;

/** Sends this minute's share. Returns how many notifications it tried to send. */
export async function sendPlanEve(
	env: { DB: D1Like; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string },
	scheduledTime: number,
	send: typeof sendPush = sendPush
) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
	const now = tokyoTime(scheduledTime);
	const slot = Math.floor(now.minutes) - EVE_START;
	if (slot < 0 || slot >= EVE_MINUTES) return 0;

	const tomorrow = addDays(now.date, 1);
	const { results } = await env.DB.prepare(DUE).bind(tomorrow, tomorrow).all<Row>();
	const byUser = new Map<string, EveItem[]>();
	for (const r of results) {
		if (eveSlot(r.userId) !== slot) continue;
		if (r.notify && JSON.parse(r.notify).planEve === false) continue;
		byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
	}
	if (!byUser.size) return 0;

	const ids = [...byUser.keys()];
	const { results: devices } = await env.DB.prepare(
		`SELECT id, user_id AS userId, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(', ')})`
	)
		.bind(...ids)
		.all<Device>();
	if (devices.length > SENDS_MAX) console.warn(`plan eve: ${devices.length} devices, sending ${SENDS_MAX}`);

	const keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
	const sending = devices.slice(0, SENDS_MAX);
	const gone: string[] = [];
	await Promise.all(
		sending.map(async (d) => {
			try {
				const message = eveMessage(byUser.get(d.userId) ?? [], tomorrow);
				if ((await send(d, message, keys, PUSH_SUBJECT)) === 'gone') gone.push(d.id);
			} catch (e) {
				console.error('plan eve failed', e);
			}
		})
	);
	if (gone.length) {
		await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(', ')})`)
			.bind(...gone)
			.run();
	}
	if (sending.length) console.log(`plan eve: sent ${sending.length}, gone ${gone.length}`);
	return sending.length;
}
