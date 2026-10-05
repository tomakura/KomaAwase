// The admin fixing or deleting a university someone typed in
import { describe, expect, it } from 'vitest';
import { deleteUniversity, renameUniversity } from './universities';
import { testDatabase } from '../../test/db';

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name, source) VALUES ('bad', 'へんな大学', 'user'), ('ok', 'ふつう大学', 'user')`);
	t.run(`INSERT INTO universities (id, name) VALUES ('pre', 'もとからの大学')`);
	t.run(`INSERT INTO users (id, email, university_id) VALUES ('u1', 'a@example.test', 'bad'), ('u2', 'b@example.test', 'ok')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name, university_id) VALUES ('t1', 'u1', 2026, '2026年度', 'bad')`);
	t.run(`INSERT INTO shared_courses (id, university_id, year, title, source, credits) VALUES ('sc1', 'bad', 2026, 'みんなの名前', 'user', 2)`);
	t.run(`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES ('ss1', 'sc1', 5, 2, 1, '202')`);
	t.run(`INSERT INTO shared_course_teachers (id, shared_course_id, name, sort_order) VALUES ('st1', 'sc1', 'みんなの先生', 0)`);
	// One synced (shows the shared values), one already the person's own
	t.run(`INSERT INTO courses (id, timetable_id, title, sync_mode, shared_course_id) VALUES ('c1', 't1', '古い名前', 'synced', 'sc1'), ('c2', 't1', '自分の名前', 'personal', 'sc1')`);
	t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, room) VALUES ('s1', 'c1', 4, 1, 1, '101'), ('s2', 'c2', 3, 3, 1, '303')`);
	t.run(`INSERT INTO reports (id, target_type, target_id, reason) VALUES ('r1', 'shared_course', 'sc1', 'spam')`);
	return t;
}

describe('deleteUniversity', () => {
	it('sets its users back to none and keeps their courses as they looked', async () => {
		const t = world();
		await deleteUniversity(t.db, 'bad');
		expect(t.rows(`SELECT id FROM universities WHERE id = 'bad'`)).toEqual([]);
		expect(t.rows(`SELECT university_id FROM users WHERE id = 'u1'`)[0].university_id).toBeNull();
		expect(t.rows(`SELECT university_id FROM users WHERE id = 'u2'`)[0].university_id).toBe('ok');
		expect(t.rows(`SELECT university_id FROM timetables`)[0].university_id).toBeNull();
		expect(t.rows(`SELECT id FROM shared_courses`)).toEqual([]);
		expect(t.rows(`SELECT status FROM reports`)[0].status).toBe('closed');
		expect(t.rows(`SELECT id, title, sync_mode, shared_course_id, credits FROM courses ORDER BY id`)).toEqual([
			{ id: 'c1', title: 'みんなの名前', sync_mode: 'personal', shared_course_id: null, credits: 2 },
			{ id: 'c2', title: '自分の名前', sync_mode: 'personal', shared_course_id: null, credits: null }
		]);
		expect(t.rows(`SELECT course_id, weekday, period_number, room FROM course_slots ORDER BY course_id`)).toEqual([
			{ course_id: 'c1', weekday: 5, period_number: 2, room: '202' },
			{ course_id: 'c2', weekday: 3, period_number: 3, room: '303' }
		]);
		expect(t.rows(`SELECT course_id, name FROM course_teachers`)).toEqual([{ course_id: 'c1', name: 'みんなの先生' }]);
	});

	it('leaves a preset university alone', async () => {
		const t = world();
		await deleteUniversity(t.db, 'pre');
		expect(t.rows(`SELECT id FROM universities WHERE id = 'pre'`)).toHaveLength(1);
	});
});

describe('renameUniversity', () => {
	it('renames, folding odd spaces', async () => {
		const t = world();
		expect(await renameUniversity(t.db, 'bad', '　なおした　大学 ')).toBeNull();
		expect(t.rows(`SELECT name FROM universities WHERE id = 'bad'`)[0].name).toBe('なおした 大学');
	});

	it('refuses a name another university has, or none', async () => {
		const t = world();
		expect(await renameUniversity(t.db, 'bad', 'ふつう大学')).toBe('同じ名前の大学がすでにあります');
		expect(await renameUniversity(t.db, 'bad', '  ')).toBe('名前を入力してください');
		expect(t.rows(`SELECT name FROM universities WHERE id = 'bad'`)[0].name).toBe('へんな大学');
	});
});
