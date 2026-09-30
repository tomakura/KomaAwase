import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { eveMessage, eveSlot } from '../plan-eve';
import { sendPlanEve } from './plan-eve';
import type { D1Like } from './reminders';

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

// 2026-09-29 (Tuesday), in Japan
const at = (h: number, m: number) => Date.UTC(2026, 8, 29, h - 9, m);

// One person on one phone, with a class, homework due on 9/30 and an event on 9/30
function world() {
	const db = database();
	const run = (sql: string, ...values: unknown[]) => db.prepare(sql).run(...(values as never[]));
	run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'てすと')`);
	run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c1', 't1', 'サンプル演習')`);
	run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('d1', 'u1', 'https://push.example.test/1', 'k', 'a')`);
	return { db, run };
}

async function fire(w: ReturnType<typeof world>, time: number) {
	const sent: { title: string; body?: string }[] = [];
	const count = await sendPlanEve({ DB: d1(w.db), VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, time, async (_s, message) => {
		sent.push(message as never);
		return 'sent';
	});
	return { sent, count };
}

describe('sendPlanEve', () => {
	it('tells about homework due tomorrow, in the person\'s own minute', async () => {
		const w = world();
		w.run(`INSERT INTO course_notes (id, course_id, kind, body, due) VALUES ('n1', 'c1', 'task', 'レポート', '2026-09-30')`);
		const slot = eveSlot('u1');
		expect((await fire(w, at(20, slot === 0 ? 1 : 0))).count).toBe(0);
		const { sent } = await fire(w, at(20, slot));
		expect(sent).toEqual([{ title: '明日：レポート（締め切り）', body: 'サンプル演習', url: '/plans', tag: 'plan-eve-2026-09-30' }]);
	});

	it('sends nothing outside 20:00 to 20:09, or for finished homework, or when turned off', async () => {
		const w = world();
		w.run(`INSERT INTO course_notes (id, course_id, kind, body, due, done) VALUES ('n1', 'c1', 'task', 'レポート', '2026-09-30', 1)`);
		w.run(`INSERT INTO events (id, user_id, title, date) VALUES ('e1', 'u1', '面接', '2026-09-30')`);
		const slot = eveSlot('u1');
		expect((await fire(w, at(19, 50 + slot))).count).toBe(0);
		expect((await fire(w, at(21, slot))).count).toBe(0);
		// the finished homework is not counted: the one event is named alone
		expect((await fire(w, at(20, slot))).sent.map((s) => s.title)).toEqual(['明日：面接']);
		w.run(`UPDATE users SET notify = '{"planEve":false}'`);
		expect((await fire(w, at(20, slot))).count).toBe(0);
	});

	it('sends one notification for several things', async () => {
		const w = world();
		w.run(`INSERT INTO course_notes (id, course_id, kind, body, due) VALUES ('n1', 'c1', 'task', 'レポート', '2026-09-30')`);
		w.run(`INSERT INTO events (id, user_id, title, date, start_time) VALUES ('e1', 'u1', '面接', '2026-09-30', '14:00')`);
		const { sent } = await fire(w, at(20, eveSlot('u1')));
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ title: '明日は2件あります', body: 'レポート、面接' });
	});
});

describe('eveMessage', () => {
	it('names an event with its time, or all day', () => {
		const base = { kind: 'event' as const, course: null, place: '駅前' };
		expect(eveMessage([{ ...base, title: '面接', start: '09:30' }], '2026-09-30').body).toBe('9:30から · 駅前');
		expect(eveMessage([{ ...base, title: '学園祭', start: null, place: null }], '2026-09-30').body).toBe('終日');
	});
});
