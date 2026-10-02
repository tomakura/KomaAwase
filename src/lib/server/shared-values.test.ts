// A synced course read everywhere as the timetable shows it, after someone else changed the
// shared course: the export, the plans and the slots a new length must not run into.
import { describe, expect, it } from 'vitest';
import { otherSlots } from './courses';
import { exportData } from './data-export';
import { listCourseChoices, loadPlans } from './plans';
import { testDatabase } from '../../test/db';

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name) VALUES ('uni', 'テスト大学')`);
	t.run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'てすと')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q3', 't1', 'Q3', 3)`);
	// Taken as Thursday 1st in room 101 under its old name; the shared course is now Friday 2nd in 202
	t.run(`INSERT INTO shared_courses (id, university_id, year, title, source, version) VALUES ('sc1', 'uni', 2026, '新しい名前', 'user', 2)`);
	t.run(`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES ('ss1', 'sc1', 5, 2, 1, '202')`);
	t.run(`INSERT INTO shared_course_teachers (id, shared_course_id, name, sort_order) VALUES ('st1', 'sc1', '新しい先生', 0)`);
	t.run(`INSERT INTO courses (id, timetable_id, title, sync_mode, shared_course_id) VALUES ('c1', 't1', '古い名前', 'synced', 'sc1')`);
	t.run(`INSERT INTO course_slots (id, course_id, weekday, period_number, span, room) VALUES ('s1', 'c1', 4, 1, 1, '101')`);
	t.run(`INSERT INTO course_terms (course_id, term_id) VALUES ('c1', 'q3')`);
	t.run(`INSERT INTO course_notes (id, course_id, kind, body, due) VALUES ('n1', 'c1', 'task', 'レポート', '2026-10-05')`);
	t.run(`INSERT INTO events (id, user_id, title, date, course_id) VALUES ('e1', 'u1', '小テスト', '2026-10-06', 'c1')`);
	return t;
}

describe('a synced course', () => {
	it('is exported with the shared values and which version they are', async () => {
		const data = await exportData(world().db, { id: 'u1' });
		expect(data.timetables[0].courses[0]).toMatchObject({
			title: '新しい名前',
			shared: true,
			sharedCourse: { id: 'sc1', version: 2 },
			slots: [{ weekday: 5, period: 2, span: 1, week: 'every', room: '202' }],
			teachers: ['新しい先生'],
			terms: ['Q3']
		});
		expect(data.events[0].course).toBe('新しい名前');
	});

	it('is named by the shared course in the plans', async () => {
		const { db } = world();
		expect(await listCourseChoices(db, 'u1', '2026-10-02')).toEqual([{ id: 'c1', title: '新しい名前' }]);
		const plans = await loadPlans(db, 'u1', '2026-10-02');
		expect(plans.map((p) => [p.title, p.course])).toEqual([
			['レポート', '新しい名前'],
			['小テスト', '新しい名前']
		]);
	});

	it('takes the shared slots when another course is lengthened', async () => {
		const { db } = world();
		expect(await otherSlots(db, 't1', null)).toEqual([{ weekday: 5, period: 2, span: 1, week: 'every', termIds: ['q3'] }]);
		expect(await otherSlots(db, 't1', 'c1')).toEqual([]);
	});

	it('is read from its own rows once it is no longer synced', async () => {
		const t = world();
		t.run(`UPDATE courses SET sync_mode = 'personal'`);
		expect(await listCourseChoices(t.db, 'u1', '2026-10-02')).toEqual([{ id: 'c1', title: '古い名前' }]);
		expect(await otherSlots(t.db, 't1', null)).toEqual([{ weekday: 4, period: 1, span: 1, week: 'every', termIds: ['q3'] }]);
	});
});
