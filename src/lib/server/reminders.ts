// Tells people a class is about to start, when they asked for it (class_reminders). A cron
// runs this every minute, so it stays small: it doesn't go through SvelteKit, one query finds
// what starts in the minutes people chose, and almost every minute that finds nothing.
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { meetsInWeek, type WeekPattern } from '../courses';
import { reminderMessage } from '../reminder';
import { termIsOn } from '../terms';
import { academicYear, tokyoTime } from '../time';
import { PUSH_SUBJECT, sendPush } from './push';

/** The part of a D1 database this needs, so a test can stand in for it */
export type D1Like = {
	prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } };
};

// The Free plan allows 50 outside requests per invocation; the rest of the work needs a few
const SENDS_MAX = 40;

// A time as minutes since midnight; it may be written 8:40 or 08:40
const minutesOf = (column: string) => `(CAST(substr(${column}, 1, instr(${column}, ':') - 1) AS INTEGER) * 60
	+ CAST(substr(${column}, instr(${column}, ':') + 1) AS INTEGER))`;
const START = minutesOf('p.start_time');

// Every phone of every person who wants a notification `minutes` before a class that starts
// now + `minutes`, today (this year's timetable, that weekday, not cancelled that day). A
// double class is one slot; each of its periods counts as a start, but a later one only when
// the notification falls in the break before it, not during the period before. The term and
// the odd/even week are judged afterwards. Parameters: year, weekday, now, date.
const DUE = `
SELECT r.minutes AS lead, ps.id AS deviceId, ps.endpoint, ps.p256dh, ps.auth,
	c.id AS courseId, c.title, s.id AS slotId, s.room, s.week_pattern AS week,
	p.number AS period, p.number - s.period_number + 1 AS part, p.start_time AS start, tm.start_date AS termStart, tm.end_date AS termEnd
FROM class_reminders r
JOIN timetables t ON t.user_id = r.user_id AND t.year = ? AND t.archived = 0
JOIN courses c ON c.timetable_id = t.id
JOIN course_slots s ON s.course_id = c.id AND s.weekday = ?
JOIN periods p ON p.timetable_id = t.id AND p.number >= s.period_number AND p.number < s.period_number + s.span
LEFT JOIN periods prev ON prev.timetable_id = t.id AND prev.number = p.number - 1
JOIN course_terms ct ON ct.course_id = c.id
JOIN terms tm ON tm.id = ct.term_id
JOIN push_subscriptions ps ON ps.user_id = r.user_id
WHERE ${START} - r.minutes = ?
	AND (p.number = s.period_number OR ${START} - r.minutes >= ${minutesOf('prev.end_time')})
	AND NOT EXISTS (SELECT 1 FROM course_notes n WHERE n.course_id = c.id AND n.kind = 'cancel' AND n.date = ?)`;

type Row = {
	lead: number;
	deviceId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	courseId: string;
	title: string;
	slotId: string;
	room: string | null;
	week: WeekPattern;
	period: number;
	part: number;
	start: string;
	termStart: string | null;
	termEnd: string | null;
};

/**
 * Sends the reminders due in the minute of `scheduledTime`. Returns how many it tried to
 * send. A phone that has dropped its subscription (404/410) is removed; a failed send is
 * logged and never stops the rest.
 */
export async function sendDueReminders(
	env: { DB: D1Like; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string },
	scheduledTime: number,
	send: typeof sendPush = sendPush
) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
	const now = tokyoTime(scheduledTime);
	const { results } = await env.DB.prepare(DUE)
		.bind(academicYear(now.date), now.weekday, Math.floor(now.minutes), now.date)
		.all<Row>();

	// A class in two terms that are both on would be found twice
	const seen = new Set<string>();
	const due = results.filter((r) => {
		if (!termIsOn({ startDate: r.termStart, endDate: r.termEnd }, now.date) || !meetsInWeek(r.week, r.termStart, now.date)) return false;
		const key = `${r.deviceId}|${r.slotId}|${r.period}|${r.lead}`;
		return !seen.has(key) && !!seen.add(key);
	});
	if (due.length > SENDS_MAX) console.warn(`class reminders: ${due.length} due, sending ${SENDS_MAX}`);

	const keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
	const sending = due.slice(0, SENDS_MAX);
	const gone: string[] = [];
	await Promise.all(
		sending.map(async (r) => {
			try {
				const message = reminderMessage({ ...r, room: r.room, date: now.date });
				if ((await send(r, message, keys, PUSH_SUBJECT)) === 'gone') gone.push(r.deviceId);
			} catch (e) {
				console.error('class reminder failed', e);
			}
		})
	);
	if (gone.length) {
		await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(', ')})`)
			.bind(...gone)
			.run();
	}
	if (sending.length) console.log(`class reminders: sent ${sending.length}, gone ${gone.length}`);
	return sending.length;
}
