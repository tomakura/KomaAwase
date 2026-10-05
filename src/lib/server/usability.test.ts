// 元に戻す, what changed in a synced course since it was last looked at, and the counts
// behind /status, on the real schema
import { describe, expect, it } from 'vitest';
import { sharedChanges, sharedSource } from '../shared-changes';
import { keepBeforeChanges, loadCourse, markSharedSeen } from './courses';
import { countMetric, METRICS, hourOf } from './metrics';
import { dailyQuality, signals } from './status';
import { deleteEventKept, deleteNoteKept, undoDelete } from './undo';
import { testDatabase } from '../../test/db';

const before = { title: '演習', teachers: ['先生A'], slots: [{ weekday: 4, period: 1, span: 1, room: '101' }], delivery: null, intensiveFrom: null, intensiveTo: null, credits: 2 };
const after = { ...before, slots: [{ weekday: 4, period: 1, span: 1, room: '202' }] };

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name) VALUES ('uni', 'テスト大学')`);
	t.run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'てすと'), ('u2', 'b@example.test', 'ほか')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name, university_id) VALUES ('t1', 'u1', 2026, '2026年度', 'uni')`);
	t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q3', 't1', 'Q3', 3)`);
	t.run(`INSERT INTO shared_courses (id, university_id, year, title, source, version, credits) VALUES ('sc1', 'uni', 2026, '演習', 'user', 2, 2)`);
	t.run(`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES ('ss1', 'sc1', 4, 1, 1, '202')`);
	t.run(`INSERT INTO shared_course_teachers (id, shared_course_id, name, sort_order) VALUES ('st1', 'sc1', '先生A', 0)`);
	// Synced and last looked at 10:00; someone else moved the room at 11:00
	t.run(`INSERT INTO courses (id, timetable_id, title, sync_mode, shared_course_id, shared_seen_at) VALUES ('c1', 't1', '演習', 'synced', 'sc1', ?)`, Date.UTC(2026, 9, 1, 1));
	t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, room) VALUES ('s1', 'c1', 4, 1, 1, '101')`);
	t.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q3')`);
	t.run(
		`INSERT INTO shared_course_edits (id, shared_course_id, user_id, diff, created_at) VALUES ('ed1', 'sc1', 'u2', ?, ?)`,
		JSON.stringify({ before, after }),
		Date.UTC(2026, 9, 1, 2)
	);
	t.run(`INSERT INTO course_notes (id, course_id, kind, body, due, done, sort_order) VALUES ('n1', 'c1', 'task', 'レポート', '2026-10-05', 1, 3)`);
	t.run(`INSERT INTO events (id, user_id, title, date, course_id, place) VALUES ('e1', 'u1', '小テスト', '2026-10-06', 'c1', 'A棟')`);
	return t;
}

describe('元に戻す', () => {
	it('puts a deleted task back as it was', async () => {
		const t = world();
		const id = await deleteNoteKept(t.db, 'u1', 'c1', 'n1');
		expect(id).toBeTypeOf('string');
		expect(t.rows(`SELECT id FROM course_notes`)).toEqual([]);
		expect(await undoDelete(t.db, 'u1', id!)).toBe(true);
		expect(t.rows(`SELECT id, body, due, done, sort_order FROM course_notes`)).toEqual([{ id: 'n1', body: 'レポート', due: '2026-10-05', done: 1, sort_order: 3 }]);
		// Only once
		expect(await undoDelete(t.db, 'u1', id!)).toBe(false);
	});

	it('puts back an event, and only for the person who deleted it', async () => {
		const t = world();
		const id = await deleteEventKept(t.db, 'u1', 'e1');
		expect(await undoDelete(t.db, 'u2', id!)).toBe(false);
		expect(await undoDelete(t.db, 'u1', id!)).toBe(true);
		expect(t.rows(`SELECT id, title, place, course_id FROM events`)).toEqual([{ id: 'e1', title: '小テスト', place: 'A棟', course_id: 'c1' }]);
	});

	it('is too late once the time has passed', async () => {
		const t = world();
		const id = await deleteNoteKept(t.db, 'u1', 'c1', 'n1');
		t.run(`UPDATE undo_items SET expires_at = 0`);
		expect(await undoDelete(t.db, 'u1', id!)).toBe(false);
	});

	it('keeps nothing for what is not there', async () => {
		expect(await deleteNoteKept(world().db, 'u1', 'c1', 'nope')).toBeNull();
	});
});

describe('changes to a synced course', () => {
	it('shows what someone else changed since it was last looked at', async () => {
		const t = world();
		const loaded = await loadCourse(t.db, 'u1', 'c1');
		expect(loaded?.shared?.changes).toEqual([{ label: '教室', before: '101', after: '202' }]);
		await markSharedSeen(t.db, 'c1');
		expect((await loadCourse(t.db, 'u1', 'c1'))?.shared?.changes).toEqual([]);
	});

	it('does not show the person their own change', async () => {
		const t = world();
		t.run(`UPDATE shared_course_edits SET user_id = 'u1'`);
		expect((await loadCourse(t.db, 'u1', 'c1'))?.shared?.changes).toEqual([]);
	});

	it('can keep the values from before, as the person’s own course', async () => {
		const t = world();
		await keepBeforeChanges(t.db, 'u1', 'c1');
		const loaded = await loadCourse(t.db, 'u1', 'c1');
		expect(loaded?.course).toMatchObject({ syncMode: 'personal', slots: [{ weekday: 4, period: 1, room: '101' }], teachers: ['先生A'] });
	});

	it('reads the differences by label', () => {
		expect(sharedChanges(before, { ...before, title: '演習 II', teachers: [] })).toEqual([
			{ label: '授業名', before: '演習', after: '演習 II' },
			{ label: '先生', before: '先生A', after: 'なし' }
		]);
	});

	it('says where the values come from', () => {
		const day = Date.UTC(2026, 9, 1, 3);
		expect(sharedSource({ source: 'syllabus', version: 1, createdAt: day, updatedAt: day })).toBe('シラバスから（2026年10月1日 確認）');
		expect(sharedSource({ source: 'user', version: 3, createdAt: day, updatedAt: day })).toBe('利用者が入力（2026年10月1日 更新）');
	});
});

describe('the counts behind /status', () => {
	it('adds up per hour and day, and turns failures into levels', async () => {
		const t = world();
		const now = Date.UTC(2026, 9, 1, 3, 30);
		await countMetric(t.d1, METRICS.pushOk, 6, 0, now);
		await countMetric(t.d1, METRICS.pushOk, 2, 0, now);
		await countMetric(t.d1, METRICS.pushFailed, 4, 0, now);
		await countMetric(t.d1, METRICS.importOk, 2, 10 * 60000, now);
		expect(t.rows(`SELECT hour, name, n FROM metrics WHERE name = 'push_ok'`)).toEqual([{ hour: hourOf(now), name: 'push_ok', n: 8 }]);
		const levels = await signals(t.db, now);
		expect(levels.find((s) => s.id === 'push')).toMatchObject({ level: 'slow', text: '直近2時間で 67% 届きました' });
		expect(levels.find((s) => s.id === 'errors')?.level).toBe('ok');
		const [day] = await dailyQuality(t.db, now);
		expect(day).toMatchObject({ day: '2026-10-01', pushOk: 8, pushFailed: 4, importOk: 2, importAvgMin: 5 });
	});
});
