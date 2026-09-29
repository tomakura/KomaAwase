import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sendDueReminders, type D1Like } from './reminders';

// The real schema: every migration, in order, on an in-memory SQLite
function database() {
	const db = new DatabaseSync(':memory:');
	const dir = new URL('../../../drizzle/', import.meta.url);
	for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort()) {
		for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) {
			if (statement.trim()) db.exec(statement);
		}
	}
	return db;
}

const d1 = (db: DatabaseSync): D1Like => ({
	prepare: (sql) => ({
		bind: (...values) => ({
			all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
			run: async () => db.prepare(sql).run(...(values as never[]))
		})
	})
});

// Tuesday 2026-09-29, 12:30 in Japan
const at = (h: number, m: number, day = 29, month = 9) => Date.UTC(2026, month - 1, day, h - 9, m);
const TUESDAY_1230 = at(12, 30);

type Options = { week?: string; span?: number; termStart?: string; termEnd?: string; leads?: number[]; archived?: number; year?: number };

// One person with a Tuesday 3rd-period class (12:40) in a term running 9/24 to 11/25, on one phone
function world(o: Options = {}) {
	const db = database();
	const run = (sql: string, ...values: unknown[]) => db.prepare(sql).run(...(values as never[]));
	run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'てすと'), ('u2', 'b@example.test', 'ゆうと')`);
	run(`INSERT INTO timetables (id, user_id, year, name, archived) VALUES ('t1', 'u1', ?, '2026年度', ?)`, o.year ?? 2026, o.archived ?? 0);
	run(`INSERT INTO periods (id, timetable_id, number, start_time, end_time) VALUES
		('p1', 't1', 1, '08:40', '10:10'), ('p3', 't1', 3, '12:40', '14:10'), ('p4', 't1', 4, '14:20', '15:50'), ('p5', 't1', 5, '16:00', '17:30')`);
	run(`INSERT INTO terms (id, timetable_id, name, start_date, end_date, sort_order) VALUES ('q3', 't1', 'Q3', ?, ?, 3)`, o.termStart ?? '2026-09-24', o.termEnd ?? '2026-11-25');
	run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c1', 't1', 'サンプル演習 II')`);
	run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q3')`);
	run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, week_pattern, room) VALUES ('s1', 'c1', 2, 3, ?, ?, 'E10')`, o.span ?? 1, o.week ?? 'every');
	run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('d1', 'u1', 'https://push.example.test/1', 'k1', 'a1')`);
	for (const minutes of o.leads ?? [10]) run(`INSERT INTO class_reminders (user_id, minutes) VALUES ('u1', ?)`, minutes);
	return { db, run };
}

type Sent = { endpoint: string; message: { title: string; body?: string; url: string; tag?: string } };

async function fire(w: ReturnType<typeof world>, time: number, result: 'sent' | 'gone' | 'failed' | Error = 'sent') {
	const sent: Sent[] = [];
	const count = await sendDueReminders(
		{ DB: d1(w.db), VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
		time,
		async (subscription, message) => {
			sent.push({ endpoint: subscription.endpoint, message: message as Sent['message'] });
			if (result instanceof Error) throw result;
			return result;
		}
	);
	return { sent, count };
}

describe('sendDueReminders', () => {
	it('sends a class the chosen number of minutes before it starts', async () => {
		const { sent, count } = await fire(world(), TUESDAY_1230);
		expect(count).toBe(1);
		expect(sent).toEqual([
			{
				endpoint: 'https://push.example.test/1',
				message: { title: '3限 サンプル演習 II が10分後に始まります', body: '12:40開始 · E10', url: '/courses/c1', tag: 'class-s1-2026-09-29-10' }
			}
		]);
	});

	it('sends only in the minute that is that long before, not a minute earlier or later', async () => {
		const w = world();
		expect((await fire(w, at(12, 29))).count).toBe(0);
		expect((await fire(w, at(12, 31))).count).toBe(0);
		expect((await fire(w, at(12, 30))).count).toBe(1);
	});

	it('sends each chosen time in its own minute', async () => {
		const w = world({ leads: [10, 30, 120] });
		const titles = async (t: number) => (await fire(w, t)).sent.map((s) => s.message.title);
		expect(await titles(at(10, 40))).toEqual(['3限 サンプル演習 II が2時間後に始まります']);
		expect(await titles(at(12, 10))).toEqual(['3限 サンプル演習 II が30分後に始まります']);
		expect(await titles(at(12, 30))).toEqual(['3限 サンプル演習 II が10分後に始まります']);
	});

	it('reads a start time written without the 0 in front', async () => {
		const w = world();
		w.run(`UPDATE periods SET start_time = '9:40' WHERE id = 'p1'`);
		w.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span) VALUES ('s0', 'c1', 2, 1, 1)`);
		expect((await fire(w, at(9, 30))).sent.map((s) => s.message.body)).toEqual(['9:40開始']);
	});

	it('sends nothing on another day of the week', async () => {
		expect((await fire(world(), at(12, 30, 30))).count).toBe(0);
	});

	it('sends nothing outside the term, and every week when the term has no dates', async () => {
		expect((await fire(world({ termEnd: '2026-09-28' }), TUESDAY_1230)).count).toBe(0);
		expect((await fire(world({ termStart: '2026-09-30' }), TUESDAY_1230)).count).toBe(0);
		const w = world();
		w.run(`UPDATE terms SET start_date = NULL, end_date = NULL`);
		expect((await fire(w, TUESDAY_1230)).count).toBe(1);
	});

	it('sends odd-week classes in odd weeks only, counting from the week the term starts in', async () => {
		// The term starts Thursday 9/24, so 9/21 to 9/27 is week 1 and Tuesday 9/29 is in week 2
		expect((await fire(world({ week: 'odd' }), TUESDAY_1230)).count).toBe(0);
		expect((await fire(world({ week: 'even' }), TUESDAY_1230)).count).toBe(1);
		expect((await fire(world({ week: 'odd' }), at(12, 30, 6, 10))).count).toBe(1);
	});

	it('leaves out a class that is cancelled that day, and not one cancelled another day', async () => {
		const w = world();
		w.run(`INSERT INTO course_notes (id, course_id, kind, date) VALUES ('n1', 'c1', 'cancel', '2026-10-06'), ('n2', 'c1', 'memo', '2026-09-29')`);
		expect((await fire(w, TUESDAY_1230)).count).toBe(1);
		w.run(`INSERT INTO course_notes (id, course_id, kind, date) VALUES ('n3', 'c1', 'cancel', '2026-09-29')`);
		expect((await fire(w, TUESDAY_1230)).count).toBe(0);
	});

	it('uses this year’s timetable that is not in the past', async () => {
		expect((await fire(world({ archived: 1 }), TUESDAY_1230)).count).toBe(0);
		expect((await fire(world({ year: 2025 }), TUESDAY_1230)).count).toBe(0);
	});

	it('sends a double class before each of its periods, but not while the first is still on', async () => {
		const w = world({ span: 2 });
		const titles = async (t: number) => (await fire(w, t)).sent.map((s) => s.message.title);
		expect(await titles(at(12, 30))).toEqual(['3限 サンプル演習 II が10分後に始まります']);
		// The second period starts at 14:20, after a break from 14:10
		expect(await titles(at(14, 10))).toEqual(['4限（2コマ目） サンプル演習 II が10分後に始まります']);
		expect(await titles(at(14, 0))).toEqual([]);
		// 30 minutes before 14:20 falls in the first period
		const early = world({ span: 2, leads: [30] });
		expect((await fire(early, at(13, 50))).count).toBe(0);
		expect((await fire(early, at(12, 10))).count).toBe(1);
	});

	it('sends at the start too, when 0 is chosen', async () => {
		const w = world({ span: 2, leads: [0] });
		expect((await fire(w, at(12, 40))).sent.map((s) => s.message.title)).toEqual(['3限 サンプル演習 II が始まります']);
		expect((await fire(w, at(14, 20))).sent.map((s) => s.message.title)).toEqual(['4限（2コマ目） サンプル演習 II が始まります']);
	});

	it('sends a class in two terms that are both on only once', async () => {
		const w = world();
		w.run(`INSERT INTO terms (id, timetable_id, name, start_date, end_date, sort_order) VALUES ('q4', 't1', 'Q4', '2026-09-01', '2027-02-08', 4)`);
		w.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q4')`);
		expect((await fire(w, TUESDAY_1230)).count).toBe(1);
	});

	it('sends to every phone of the person, and to nobody who chose no time', async () => {
		const w = world();
		w.run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('d2', 'u1', 'https://push.example.test/2', 'k2', 'a2'), ('d3', 'u2', 'https://push.example.test/3', 'k3', 'a3')`);
		expect((await fire(w, TUESDAY_1230)).sent.map((s) => s.endpoint).sort()).toEqual(['https://push.example.test/1', 'https://push.example.test/2']);
	});

	it('removes a phone that has dropped its subscription', async () => {
		const w = world();
		await fire(w, TUESDAY_1230, 'gone');
		expect(w.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE id = ?').get('d1')).toEqual({ n: 0 });
	});

	it('does not fail when sending does', async () => {
		const w = world();
		expect((await fire(w, TUESDAY_1230, new Error('push service down'))).count).toBe(1);
		expect((await fire(w, TUESDAY_1230, 'failed')).count).toBe(1);
	});

	it('does nothing without the keys', async () => {
		const w = world();
		const sent: unknown[] = [];
		const count = await sendDueReminders({ DB: d1(w.db) }, TUESDAY_1230, async (s) => (sent.push(s), 'sent' as const));
		expect([count, sent]).toEqual([0, []]);
	});

	it('sends at most 40 in a minute', async () => {
		const w = world();
		for (let i = 0; i < 60; i++) {
			w.run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, 'u1', ?, 'k', 'a')`, `x${i}`, `https://push.example.test/x${i}`);
		}
		expect((await fire(w, TUESDAY_1230)).count).toBe(40);
	});
});
