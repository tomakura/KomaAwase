// Tells people a class is about to start, when they asked for it (class_reminders). A cron
// runs this every minute, so it stays small: it doesn't go through SvelteKit, one query finds
// what starts in the minutes people chose, and almost every minute that finds nothing.
// Relative imports only, because the Worker's entry file (worker/entry.js) reaches it directly.
import { meetsInWeek, type WeekPattern } from '../courses';
import { isQuiet } from '../notify';
import { reminderMessage } from '../reminder';
import { termIsOn } from '../terms';
import { academicYear, tokyoTime } from '../time';
import { sendPush } from './push';
import { deliver, type PushEnv } from './push-queue';

export type { D1Like } from './push-queue';

// A time as minutes since midnight; it may be written 8:40 or 08:40
const minutesOf = (column: string) => `(CAST(substr(${column}, 1, instr(${column}, ':') - 1) AS INTEGER) * 60
	+ CAST(substr(${column}, instr(${column}, ':') + 1) AS INTEGER))`;
const START = minutesOf('p.start_time');

// Every phone of every person who wants a notification `minutes` before a class that starts
// now + `minutes`, today (this year's timetable, that weekday, not cancelled, moved away or a
// day off in the timetable's calendar). A
// double class is one slot; each of its periods counts as a start, but a later one only when
// the notification falls in the break before it, not during the period before. The term and
// the odd/even week are judged afterwards. A course synced with the shared data is read from
// it (its title and slots, as the timetable shows them); any other from the person's own rows.
// Parameters: year, weekday, now, date (four times), then the same again for the synced courses.
const due = (synced: boolean) => `
SELECT r.minutes AS lead, u.notify AS notify, ps.id AS deviceId, ps.endpoint, ps.p256dh, ps.auth,
	c.id AS courseId, ${synced ? 'sc.title' : 'c.title'} AS title, s.id AS slotId, s.room, s.week_pattern AS week,
	p.number AS period, p.number - s.period_number + 1 AS part, p.start_time AS start, tm.start_date AS termStart, tm.end_date AS termEnd
FROM class_reminders r
JOIN timetables t ON t.user_id = r.user_id AND t.year = ? AND t.archived = 0
${
	synced
		? `JOIN courses c ON c.timetable_id = t.id AND c.sync_mode = 'synced'
JOIN shared_courses sc ON sc.id = c.shared_course_id
JOIN shared_course_slots s ON s.shared_course_id = sc.id AND s.weekday = ?`
		: `JOIN courses c ON c.timetable_id = t.id
	AND (c.sync_mode <> 'synced' OR NOT EXISTS (SELECT 1 FROM shared_courses x WHERE x.id = c.shared_course_id))
JOIN course_slots s ON s.course_id = c.id AND s.weekday = ?`
}
JOIN periods p ON p.timetable_id = t.id AND p.number >= s.period_number AND p.number < s.period_number + s.span
LEFT JOIN periods prev ON prev.timetable_id = t.id AND prev.number = p.number - 1
JOIN course_terms ct ON ct.course_id = c.id
JOIN terms tm ON tm.id = ct.term_id
JOIN push_subscriptions ps ON ps.user_id = r.user_id
JOIN users u ON u.id = r.user_id
WHERE ${START} - r.minutes = ?
	AND (p.number = s.period_number OR ${START} - r.minutes >= ${minutesOf('prev.end_time')})
	AND NOT EXISTS (SELECT 1 FROM course_notes n WHERE n.course_id = c.id AND n.kind = 'cancel' AND n.date = ?)
	AND NOT EXISTS (SELECT 1 FROM calendar_entries ce WHERE ce.timetable_id = t.id AND ce.kind = 'off' AND ce.start_date <= ? AND ce.end_date >= ?)
	AND NOT EXISTS (SELECT 1 FROM course_moves mv WHERE mv.course_id = c.id AND mv.from_date = ?)`;

// A class moved to today (course_moves), in the period it moved to. Parameters: year, date, now.
const MOVED = `
SELECT r.minutes AS lead, u.notify AS notify, ps.id AS deviceId, ps.endpoint, ps.p256dh, ps.auth,
	c.id AS courseId, coalesce((SELECT sc.title FROM shared_courses sc WHERE c.sync_mode = 'synced' AND sc.id = c.shared_course_id), c.title) AS title,
	m.id AS slotId, m.room, 'every' AS week, p.number AS period, p.number - m.period + 1 AS part, p.start_time AS start,
	NULL AS termStart, NULL AS termEnd
FROM class_reminders r
JOIN timetables t ON t.user_id = r.user_id AND t.year = ? AND t.archived = 0
JOIN courses c ON c.timetable_id = t.id
JOIN course_moves m ON m.course_id = c.id AND m.to_date = ?
JOIN periods p ON p.timetable_id = t.id AND p.number >= m.period AND p.number < m.period + m.span
LEFT JOIN periods prev ON prev.timetable_id = t.id AND prev.number = p.number - 1
JOIN push_subscriptions ps ON ps.user_id = r.user_id
JOIN users u ON u.id = r.user_id
WHERE ${START} - r.minutes = ?
	AND (p.number = m.period OR ${START} - r.minutes >= ${minutesOf('prev.end_time')})`;
const DUE = `${due(false)}\nUNION ALL${due(true)}\nUNION ALL${MOVED}`;

type Row = {
	lead: number;
	notify: string | null;
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
 * Sends the reminders due in the minute of `scheduledTime` (more than one run can send at
 * once go through the push queue: src/lib/server/push-queue.ts). Returns how many it sent or
 * queued. A notification not sent by the time the class starts is dropped.
 */
export async function sendDueReminders(env: PushEnv, scheduledTime: number, send: typeof sendPush = sendPush) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
	const now = tokyoTime(scheduledTime);
	const year = academicYear(now.date);
	const minute = Math.floor(now.minutes);
	const params = [year, now.weekday, minute, now.date, now.date, now.date, now.date];
	const { results } = await env.DB.prepare(DUE)
		.bind(...params, ...params, year, now.date, minute)
		.all<Row>();

	// A class in two terms that are both on would be found twice
	const seen = new Set<string>();
	const due = results.filter((r) => {
		if (!termIsOn({ startDate: r.termStart, endDate: r.termEnd }, now.date) || !meetsInWeek(r.week, r.termStart, now.date)) return false;
		if (r.notify && isQuiet(JSON.parse(r.notify).quiet, minute)) return false;
		const key = `${r.deviceId}|${r.slotId}|${r.period}|${r.lead}`;
		return !seen.has(key) && !!seen.add(key);
	});
	if (!due.length) return 0;

	const items = due.map((r) => ({
		deviceId: r.deviceId,
		endpoint: r.endpoint,
		p256dh: r.p256dh,
		auth: r.auth,
		message: reminderMessage({ ...r, room: r.room, date: now.date }),
		// Not after the class has started
		expires: scheduledTime + (r.lead + 1) * 60_000
	}));
	const { sent, queued } = await deliver(env, items, send, scheduledTime);
	console.log(`class reminders: sent ${sent}, queued ${queued}`);
	return sent + queued;
}
