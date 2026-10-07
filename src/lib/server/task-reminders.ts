// Tells people about homework on the day it is due, when they turned it on (notify kinds
// taskMorning, taskBefore3h, taskBefore1h): at 8:00, spread over ten minutes like the 20:00
// one (plan-eve.ts), and 3 or 1 hours before a due time. The cron that runs every minute calls
// it; almost every minute an indexed query finds nothing.
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { isQuiet, wants, type NotifyKind } from '../notify';
import { eveSlot } from '../plan-eve';
import { LEADS, MORNING_MINUTES, MORNING_START, leadMessage, morningMessage, type TaskItem } from '../task-reminders';
import { addDays, tokyoTime } from '../time';
import { sendPush } from './push';
import { deliver, type PushEnv } from './push-queue';

type Row = TaskItem & { userId: string; notify: string | null };
type Device = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };
type Message = { title: string; body?: string; url: string; tag?: string };

const COURSE = `coalesce((SELECT sc.title FROM shared_courses sc WHERE c.sync_mode = 'synced' AND sc.id = c.shared_course_id), c.title)`;

// Homework not done, due on the date (and at the time, when one is given). Parameters: date[, time].
const tasks = (withTime: boolean) => `
SELECT n.id, n.body AS title, ${COURSE} AS course, n.due_time AS dueTime, t.user_id AS userId, u.notify AS notify
FROM course_notes n
JOIN courses c ON c.id = n.course_id
JOIN timetables t ON t.id = c.timetable_id AND t.archived = 0
JOIN users u ON u.id = t.user_id
WHERE n.due = ?${withTime ? ' AND n.due_time = ?' : ''} AND n.kind = 'task' AND n.done = 0`;

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

async function devicesOf(env: PushEnv, ids: string[]) {
	// D1 takes at most 100 bound values per query
	const devices: Device[] = [];
	for (let i = 0; i < ids.length; i += 90) {
		const part = ids.slice(i, i + 90);
		const { results } = await env.DB.prepare(
			`SELECT id, user_id AS userId, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${part.map(() => '?').join(', ')})`
		)
			.bind(...part)
			.all<Device>();
		devices.push(...results);
	}
	return devices;
}

function allowed(r: Row, kind: NotifyKind, minutes: number) {
	const settings = r.notify ? JSON.parse(r.notify) : null;
	return wants(settings, kind) && !isQuiet(settings?.quiet, minutes);
}

/** Sends this minute's homework notifications. Returns how many it sent or queued. */
export async function sendTaskReminders(env: PushEnv, scheduledTime: number, send: typeof sendPush = sendPush, dropLate = false) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
	const now = tokyoTime(scheduledTime);
	const minute = Math.floor(now.minutes);
	const items: { userId: string; message: Message; expires: number }[] = [];

	// The morning one: what is due today, unless its time is 8:00 or before
	const slot = minute - MORNING_START;
	if (slot >= 0 && slot < MORNING_MINUTES) {
		const { results } = await env.DB.prepare(tasks(false)).bind(now.date).all<Row>();
		const byUser = new Map<string, Row[]>();
		for (const r of results) {
			if (eveSlot(r.userId) !== slot || (r.dueTime && r.dueTime <= '08:00') || !allowed(r, 'taskMorning', minute)) continue;
			byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
		}
		// Still worth sending until midnight
		const expires = scheduledTime + (24 * 60 - minute) * 60_000;
		for (const [userId, rows] of byUser) items.push({ userId, message: morningMessage(rows, now.date), expires });
	}

	// Some hours before a due time: the homework due exactly that long from now
	for (const lead of LEADS) {
		const at = minute + lead.minutes;
		const date = at >= 24 * 60 ? addDays(now.date, 1) : now.date;
		const { results } = await env.DB.prepare(tasks(true)).bind(date, hhmm(at % (24 * 60))).all<Row>();
		for (const r of results) {
			if (!allowed(r, lead.kind, minute)) continue;
			items.push({ userId: r.userId, message: leadMessage(r, lead.label, lead.minutes), expires: scheduledTime + lead.minutes * 60_000 });
		}
	}
	if (!items.length) return 0;

	const devices = await devicesOf(env, [...new Set(items.map((i) => i.userId))]);
	const out = items.flatMap((i) =>
		devices
			.filter((d) => d.userId === i.userId)
			.map((d) => ({ deviceId: d.id, endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, message: i.message, expires: i.expires }))
	);
	if (!out.length) return 0;
	const { sent, queued } = await deliver(env, out, send, dropLate);
	console.log(`task reminders: sent ${sent}, queued ${queued}`);
	return sent + queued;
}
