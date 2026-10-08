import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import type { D1Like } from './push-queue';

const sent: string[] = [];
vi.mock('./push', () => ({
	PUSH_SUBJECT: 'mailto:test@example.test',
	sendPush: async (s: { endpoint: string }, message: { title: string }) => (sent.push(`${s.endpoint} ${message.title}`), 'sent')
}));
const { runEarly, runMinute } = await import('./minute-clock');

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

// 22:59 in Japan, an hour before homework due at 23:59, on an iPhone and an Android phone
const MINUTE_2259 = Date.UTC(2026, 8, 29, 13, 59);
const IPHONE = 'https://web.push.apple.com/1';
const ANDROID = 'https://fcm.googleapis.com/fcm/send/2';

function world() {
	const db = database();
	const run = (sql: string, ...values: unknown[]) => db.prepare(sql).run(...(values as never[]));
	run(`INSERT INTO users (id, email, nickname, notify) VALUES ('u1', 'a@example.test', 'てすと', '{"taskBefore1h":true}')`);
	run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c1', 't1', 'サンプル演習')`);
	run(`INSERT INTO course_notes (id, course_id, kind, body, due, due_time) VALUES ('n1', 'c1', 'task', 'レポート', '2026-09-29', '23:59')`);
	run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ('d1', 'u1', ?, 'k', 'a'), ('d2', 'u1', ?, 'k', 'a')`, IPHONE, ANDROID);
	return { env: { DB: d1(db), VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, run };
}

describe('iPhones sent early', () => {
	it('get the minute before it begins, and only what is new when it does', async () => {
		const { env, run } = world();
		sent.length = 0;
		vi.useFakeTimers({ now: MINUTE_2259 - 15_000, toFake: ['Date'] });
		const early = await runEarly(env, MINUTE_2259);
		expect(sent).toEqual([`${IPHONE} あと1時間：レポート`]);

		// Homework added in between
		run(`INSERT INTO course_notes (id, course_id, kind, body, due, due_time) VALUES ('n2', 'c1', 'task', '小テスト', '2026-09-29', '23:59')`);
		sent.length = 0;
		vi.setSystemTime(MINUTE_2259);
		expect(await runMinute(env, MINUTE_2259, MINUTE_2259, new Set(early))).toBe(true);
		expect(sent.sort()).toEqual([`${ANDROID} あと1時間：レポート`, `${ANDROID} あと1時間：小テスト`, `${IPHONE} あと1時間：小テスト`]);
		vi.useRealTimers();
	});
});
