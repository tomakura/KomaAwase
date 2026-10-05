// The saved file put back: into an account without that year, over the year's timetable, or
// added to it. Nothing is taken by id from the file.
import { describe, expect, it } from 'vitest';
import { exportData } from './data-export';
import { readBackup, restoreBackup } from './data-restore';
import { testDatabase } from '../../test/db';

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO users (id, email) VALUES ('u1', 'a@example.test'), ('u2', 'b@example.test')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q1', 't1', 'Q1', 0), ('q2', 't1', 'Q2', 1)`);
	t.run(`INSERT INTO periods (id, timetable_id, number, start_time, end_time) VALUES ('p1', 't1', 1, '09:00', '10:30'), ('p2', 't1', 2, '10:40', '12:10')`);
	t.run(`INSERT INTO courses (id, timetable_id, title, color, credits) VALUES ('c1', 't1', '線形代数', 'blue', 2), ('c2', 't1', '英語', 'red', null)`);
	t.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q1'), ('c2', 'q2')`);
	t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, week_pattern, room) VALUES ('s1', 'c1', 1, 2, 1, 'odd', 'A101'), ('s2', 'c2', 3, 1, 2, 'every', null)`);
	t.run(`INSERT INTO course_teachers (id, course_id, name, sort_order) VALUES ('tc1', 'c1', '山田', 0)`);
	t.run(`INSERT INTO course_notes (id, course_id, kind, body, due) VALUES ('n1', 'c1', 'task', 'レポート', '2026-10-05')`);
	t.run(`INSERT INTO course_absences (id, course_id, date) VALUES ('a1', 'c1', '2026-04-13')`);
	t.run(`INSERT INTO events (id, user_id, title, date, course_id) VALUES ('e1', 'u1', '小テスト', '2026-10-06', 'c1')`);
	return t;
}

async function saved(t: ReturnType<typeof world>) {
	return readBackup(JSON.parse(JSON.stringify(await exportData(t.db, { id: 'u1' }))))!;
}

describe('restoreBackup', () => {
	it('adds the year to an account without it', async () => {
		const t = world();
		const backup = await saved(t);
		const { courseIds, eventCount } = await restoreBackup(t.db, { id: 'u2', universityId: null }, backup, ['add'], true);
		expect(courseIds[0]).toHaveLength(2);
		expect(eventCount).toBe(1);
		expect(t.rows(`SELECT year, name FROM timetables WHERE user_id = 'u2'`)).toEqual([{ year: 2026, name: '2026年度' }]);
		expect(
			t.rows(`SELECT c.title, c.color, c.credits, s.weekday, s.period_number, s.week_pattern, s.room FROM courses c
				JOIN timetables tt ON tt.id = c.timetable_id JOIN course_slots s ON s.course_id = c.id WHERE tt.user_id = 'u2' ORDER BY c.title`)
		).toEqual([
			{ title: '線形代数', color: 'blue', credits: 2, weekday: 1, period_number: 2, week_pattern: 'odd', room: 'A101' },
			{ title: '英語', color: 'red', credits: null, weekday: 3, period_number: 1, week_pattern: 'every', room: null }
		]);
		const id = courseIds[0][0];
		expect(t.rows(`SELECT kind, body, due FROM course_notes WHERE course_id = ?`, id)).toEqual([{ kind: 'task', body: 'レポート', due: '2026-10-05' }]);
		expect(t.rows(`SELECT date FROM course_absences WHERE course_id = ?`, id)).toEqual([{ date: '2026-04-13' }]);
		expect(t.rows(`SELECT name FROM course_teachers WHERE course_id = ?`, id)).toEqual([{ name: '山田' }]);
		expect(t.rows(`SELECT t.name FROM course_terms ct JOIN terms t ON t.id = ct.term_id WHERE ct.course_id = ?`, id)).toEqual([{ name: 'Q1' }]);
		expect(t.rows(`SELECT course_id FROM events WHERE user_id = 'u2'`)).toEqual([{ course_id: id }]);
	});

	it('does not add a year the account has, and skips', async () => {
		const t = world();
		const backup = await saved(t);
		expect((await restoreBackup(t.db, { id: 'u1', universityId: null }, backup, ['add'], false)).courseIds[0]).toEqual([null, null]);
		expect(t.rows(`SELECT count(*) AS n FROM courses`)[0].n).toBe(2);
	});

	it('replaces the year in place, keeping the timetable', async () => {
		const t = world();
		const backup = await saved(t);
		t.run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c3', 't1', 'あとから足した')`);
		await restoreBackup(t.db, { id: 'u1', universityId: null }, backup, ['replace'], true);
		expect(t.rows(`SELECT title FROM courses WHERE timetable_id = 't1' ORDER BY title`).map((r) => r.title)).toEqual(['線形代数', '英語']);
		expect(t.rows(`SELECT count(*) AS n FROM terms WHERE timetable_id = 't1'`)[0].n).toBe(2);
		// The event was already there
		expect(t.rows(`SELECT count(*) AS n FROM events`)[0].n).toBe(1);
	});

	it('stops a replace when the timetable still has files', async () => {
		const t = world();
		const backup = await saved(t);
		t.run(`INSERT INTO course_files (id, course_id, storage_key, name, mime, size) VALUES ('f1', 'c1', 'k', 'a.pdf', 'application/pdf', 1)`);
		await expect(restoreBackup(t.db, { id: 'u1', universityId: null }, backup, ['replace'], false)).rejects.toThrow();
		expect(t.rows(`SELECT count(*) AS n FROM courses WHERE timetable_id = 't1'`)[0].n).toBe(2);
	});

	it('merges: only courses the timetable lacks', async () => {
		const t = world();
		const backup = await saved(t);
		t.run(`DELETE FROM courses WHERE id = 'c2'`);
		const { courseIds } = await restoreBackup(t.db, { id: 'u1', universityId: null }, backup, ['merge'], false);
		expect(courseIds[0][0]).toBeNull();
		expect(t.rows(`SELECT title FROM courses WHERE timetable_id = 't1' ORDER BY title`).map((r) => r.title)).toEqual(['線形代数', '英語']);
	});
});

describe('readBackup', () => {
	it('refuses other files and bounds what it reads', () => {
		expect(readBackup({ app: 'x', format: 1, timetables: [] })).toBeNull();
		const b = readBackup({
			app: 'コマあわせ',
			format: 1,
			timetables: [
				{
					year: 2026,
					periods: [{ number: 1, start: '09:00', end: '10:30' }],
					terms: [{ name: 'Q1' }],
					courses: [{ title: 'x'.repeat(100), color: 'evil', terms: ['Q1'], slots: [{ weekday: 9, period: 1 }, { weekday: 1, period: 5 }, { weekday: 1, period: 1 }] }]
				}
			]
		})!;
		expect(b.timetables[0].courses[0]).toMatchObject({ color: 'gray', slots: [{ weekday: 1, period: 1, span: 1, week: 'every', room: null }] });
		expect([...b.timetables[0].courses[0].title]).toHaveLength(60);
	});
});
