// Saving reviewed courses: new ones added, a chosen one already there set to what was read
import { describe, expect, it } from 'vitest';
import { saveReviewed } from './review';
import { testDatabase } from '../../../test/db';

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO users (id, email) VALUES ('u1', 'a@example.test'), ('u2', 'b@example.test')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度'), ('t2', 'u2', 2026, '2026年度')`);
	t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q1', 't1', 'Q1', 1)`);
	t.run(`INSERT INTO periods (id, timetable_id, number, start_time, end_time) VALUES ('p1', 't1', 1, '09:00', '10:30'), ('p2', 't1', 2, '10:40', '12:10'), ('p3', 't1', 3, '13:00', '14:30')`);
	t.run(`INSERT INTO courses (id, timetable_id, title, color) VALUES ('c1', 't1', '線形代数', 'blue'), ('other', 't2', 'よその授業', 'blue')`);
	t.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q1')`);
	t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, week_pattern, room) VALUES ('s1', 'c1', 1, 2, 1, 'odd', 'A101')`);
	return t;
}

const form = (rows: unknown[]) => {
	const f = new FormData();
	f.set('rows', JSON.stringify(rows));
	f.append('term', 'q1');
	return f;
};
const timetable = { id: 't1', year: 2026, universityId: null };

describe('saveReviewed', () => {
	it('adds new courses and updates a chosen one, keeping its terms, color and week', async () => {
		const t = world();
		const result = await saveReviewed(
			t.db,
			'u1',
			timetable,
			form([
				{ title: '英語', teachers: [], slots: [{ weekday: 2, period: 1, span: 1, room: '' }], credits: 1, sharedId: null, updateId: null },
				{ title: '線形代数', teachers: ['山田'], slots: [{ weekday: 1, period: 2, span: 1, room: 'B202' }], credits: null, sharedId: null, updateId: 'c1' }
			])
		);
		expect(result).toEqual({ termId: 'q1', changedShared: [null] });
		expect(t.rows(`SELECT title, credits FROM courses WHERE timetable_id = 't1' ORDER BY title`)).toEqual([
			{ title: '線形代数', credits: null },
			{ title: '英語', credits: 1 }
		]);
		expect(t.rows(`SELECT weekday, period_number, week_pattern, room FROM course_slots WHERE course_id = 'c1'`)).toEqual([
			{ weekday: 1, period_number: 2, week_pattern: 'odd', room: 'B202' }
		]);
		expect(t.rows(`SELECT name FROM course_teachers WHERE course_id = 'c1'`)).toEqual([{ name: '山田' }]);
		expect(t.rows(`SELECT term_id FROM course_terms WHERE course_id = 'c1'`)).toEqual([{ term_id: 'q1' }]);
		expect(t.rows(`SELECT color FROM courses WHERE id = 'c1'`)[0].color).toBe('blue');
	});

	it('checks the credits of a course it updates', async () => {
		const t = world();
		const result = await saveReviewed(
			t.db,
			'u1',
			timetable,
			form([{ title: '線形代数', teachers: [], slots: [{ weekday: 1, period: 2, span: 1, room: '' }], credits: -5, updateId: 'c1' }])
		);
		expect(result).toHaveProperty('status', 400);
		expect(t.rows(`SELECT credits FROM courses WHERE id = 'c1'`)[0].credits).toBeNull();
	});

	it('refuses to update a course of another timetable', async () => {
		const t = world();
		await expect(
			saveReviewed(t.db, 'u1', timetable, form([{ title: 'x', teachers: [], slots: [{ weekday: 1, period: 1, span: 1, room: '' }], updateId: 'other' }]))
		).rejects.toMatchObject({ status: 400 });
		expect(t.rows(`SELECT count(*) AS n FROM course_slots WHERE course_id = 'other'`)[0].n).toBe(0);
	});
});
