// Reading a timetable for someone else (a friend, the image export): no viewer
import { describe, expect, it } from 'vitest';
import { loadTimetable } from './timetable';
import { testDatabase } from '../../test/db';

describe('loadTimetable', () => {
	it('reads courses into the right fields without a viewer', async () => {
		const t = testDatabase();
		t.run(`INSERT INTO users (id, email) VALUES ('u1', 'a@example.test')`);
		t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
		t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q1', 't1', '後期', 1)`);
		t.run(`INSERT INTO periods (id, timetable_id, number, start_time, end_time) VALUES ('p1', 't1', 1, '09:00', '10:30')`);
		t.run(`INSERT INTO courses (id, timetable_id, title, color) VALUES ('c1', 't1', '線形代数', 'red')`);
		t.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q1')`);
		t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, week_pattern, room) VALUES ('s1', 'c1', 1, 1, 1, 'every', 'A101')`);

		for (const viewer of [undefined, 'u1']) {
			const { courses } = await loadTimetable(t.db, 't1', '2026-10-06', viewer);
			expect(courses).toMatchObject([
				{ id: 'c1', title: '線形代数', color: 'red', termIds: ['q1'], sharedChanged: false, slots: [{ weekday: 1, period: 1, room: 'A101' }] }
			]);
		}
	});
});
