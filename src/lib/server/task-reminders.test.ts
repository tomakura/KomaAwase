import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { eveSlot } from '../plan-eve';
import type { D1Like } from './reminders';
import { sendTaskReminders } from './task-reminders';

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

// 2026-09-29, in Japan
const at = (h: number, m: number, day = 29) => Date.UTC(2026, 8, day, h - 9, m);

// One person on one phone with homework due 9/29 at 23:59, who turned on all three kinds
function world(notify = '{"taskMorning":true,"taskBefore3h":true,"taskBefore1h":true}') {
	const db = database();
	const run = (sql: string, ...values: unknown[]) => db.prepare(sql).run(...(values as never[]));
	run(`INSERT INTO users (id, email, nickname, notify) VALUES ('u1', 'a@example.test', 'てすと', ?)`, notify);
	run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c1', 't1', 'サンプル演習')`);
	run(`INSERT INTO course_notes (id, course_id, kind, body, due, due_time) VALUES ('n1', 'c1', 'task', 'レポート', '2026-09-29', '23:59')`);
	run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('d1', 'u1', 'https://push.example.test/1', 'k', 'a')`);
	return { db, run };
}

async function fire(w: ReturnType<typeof world>, time: number) {
	const sent: { title: string; body?: string }[] = [];
	const count = await sendTaskReminders({ DB: d1(w.db), VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, time, async (_s, message) => {
		sent.push(message as never);
		return 'sent';
	});
	return { sent, count };
}

describe('sendTaskReminders', () => {
	it('tells in the morning, in the person\'s own minute', async () => {
		const w = world();
		const { sent } = await fire(w, at(8, eveSlot('u1')));
		expect(sent.map((m) => [m.title, m.body])).toEqual([['今日まで：レポート', 'サンプル演習 · 23:59まで']]);
		expect((await fire(w, at(8, (eveSlot('u1') + 1) % 10))).count).toBe(0);
	});

	it('tells 3 hours and 1 hour before the due time, and not when done', async () => {
		const w = world();
		expect((await fire(w, at(20, 59))).sent.map((m) => m.title)).toEqual(['あと3時間：レポート']);
		expect((await fire(w, at(22, 59))).sent.map((m) => m.title)).toEqual(['あと1時間：レポート']);
		expect((await fire(w, at(22, 58))).count).toBe(0);
		w.run(`UPDATE course_notes SET done = 1`);
		expect((await fire(w, at(22, 59))).count).toBe(0);
	});

	it('finds homework due after midnight', async () => {
		const w = world();
		w.run(`UPDATE course_notes SET due = '2026-09-30', due_time = '00:30'`);
		expect((await fire(w, at(23, 30))).sent.map((m) => m.title)).toEqual(['あと1時間：レポート']);
	});

	it('starts off, and keeps quiet in the chosen hours', async () => {
		expect((await fire(world('{}'), at(20, 59))).count).toBe(0);
		const quiet = world('{"taskBefore3h":true,"quiet":{"from":"20:00","to":"07:00"}}');
		expect((await fire(quiet, at(20, 59))).count).toBe(0);
	});
});
