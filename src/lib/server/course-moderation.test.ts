// The admin taking down an improper shared course, seeing who made it, and the reports
import { describe, expect, it } from 'vitest';
import { cancelMarkers } from './cancellations';
import { saveReport } from './reports';
import {
	adminSearchShared,
	loadEdits,
	loadSharedCourse,
	removePreview,
	removeShared,
	sharedCoursesBy,
	sharedCreator,
	writeShared
} from './shared-courses';
import { findOrCreateUniversity, getUserUniversity } from './universities';
import { testDatabase } from '../../test/db';

const values = (title: string, weekday = 1, period = 1, span = 1) => ({
	title,
	teachers: ['先生'],
	slots: [{ weekday, period, span, week: 'every' as const, room: '101' }],
	delivery: null,
	intensiveFrom: null,
	intensiveTo: null,
	credits: 2
});

async function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name) VALUES ('uni', 'テスト大学')`);
	t.run(`INSERT INTO users (id, email, nickname, university_id) VALUES
		('troll', 't@example.test', 'あらし', 'uni'), ('u2', 'b@example.test', 'ふつう', 'uni'),
		('u3', 'c@example.test', 'ひと', 'uni'), ('admin', 'a@example.test', 'うんえい', 'uni')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name, university_id) VALUES
		('t1', 'troll', 2026, '2026年度', 'uni'), ('t2', 'u2', 2026, '2026年度', 'uni'), ('t3', 'u3', 2026, '2026年度', 'uni')`);
	// The troll adds the course; u3 then changes it
	const added = writeShared(t.db, { userId: 'troll', universityId: 'uni', year: 2026, termNames: [], existing: null, values: values('ひどい授業') });
	await t.db.batch(added.statements as [never]);
	const changed = writeShared(t.db, {
		userId: 'u3',
		universityId: 'uni',
		year: 2026,
		termNames: [],
		existing: await loadSharedCourse(t.db, added.id),
		values: values('ひどい授業2')
	});
	await t.db.batch(changed.statements as [never]);
	const id = added.id;
	// The troll and u2 sync it, u3 keeps it as their own
	t.run(`INSERT INTO courses (id, timetable_id, title, sync_mode, shared_course_id) VALUES
		('c1', 't1', '古い', 'synced', '${id}'), ('c2', 't2', '古い', 'synced', '${id}'), ('c3', 't3', '自分の', 'personal', '${id}')`);
	t.run(`INSERT INTO course_notes (id, course_id, kind, date, body) VALUES ('n2', 'c2', 'memo', null, 'メモ'), ('k1', 'c1', 'cancel', '2026-10-07', '')`);
	t.run(`INSERT INTO reports (id, target_type, target_id, reason) VALUES ('r1', 'shared_course', '${id}', '不適切な内容'), ('r2', 'shared_cancel', '${id}|2026-10-07', '休講')`);
	return { t, id };
}

describe('sharedCreator and sharedCoursesBy', () => {
	it('finds who added the course, and what each person added or changed', async () => {
		const { t, id } = await world();
		expect(await sharedCreator(t.db, id)).toEqual({ id: 'troll', nickname: 'あらし' });
		expect(await sharedCoursesBy(t.db, 'troll')).toEqual([{ id, title: 'ひどい授業2', year: 2026, university: 'テスト大学', created: 1, edits: 1 }]);
		expect((await sharedCoursesBy(t.db, 'u3'))[0]).toMatchObject({ id, created: 0, edits: 1 });
		const { edits } = await loadEdits(t.db, id);
		expect(edits.map((e) => [e.userId, e.nickname])).toEqual([
			['u3', 'ひと'],
			['troll', 'あらし']
		]);
	});
});

describe('removeShared', () => {
	it('deletes the creator’s copy, keeps the others as their own, closes reports and warns', async () => {
		const { t, id } = await world();
		const course = (await loadSharedCourse(t.db, id))!;
		expect(await removePreview(t.db, id, 'troll')).toEqual({ creatorCourses: ['c1'], others: 2 });
		await t.db.batch(removeShared(t.db, course, { creatorId: 'troll', warning: '消しました', adminId: 'admin' }) as [never]);
		expect(t.rows(`SELECT id FROM shared_courses`)).toEqual([]);
		expect(t.rows(`SELECT id, title, sync_mode, shared_course_id FROM courses ORDER BY id`)).toEqual([
			{ id: 'c2', title: 'ひどい授業2', sync_mode: 'personal', shared_course_id: null },
			{ id: 'c3', title: '自分の', sync_mode: 'personal', shared_course_id: null }
		]);
		expect(t.rows(`SELECT course_id, weekday, room FROM course_slots`)).toEqual([{ course_id: 'c2', weekday: 1, room: '101' }]);
		expect(t.rows(`SELECT id FROM course_notes`)).toEqual([{ id: 'n2' }]);
		expect(t.rows(`SELECT id, status FROM reports ORDER BY id`)).toEqual([
			{ id: 'r1', status: 'closed' },
			{ id: 'r2', status: 'closed' }
		]);
		expect(t.rows(`SELECT user_id, body, sent_by FROM warnings`)).toEqual([{ user_id: 'troll', body: '消しました', sent_by: 'admin' }]);
	});

	it('changes nothing when the course changed since the page was read', async () => {
		const { t, id } = await world();
		const course = (await loadSharedCourse(t.db, id))!;
		t.run(`UPDATE shared_courses SET version = version + 1`);
		await expect(t.db.batch(removeShared(t.db, course, { creatorId: 'troll', warning: null, adminId: 'admin' }) as [never])).rejects.toThrow();
		expect(t.rows(`SELECT id FROM courses`)).toHaveLength(3);
		expect(t.rows(`SELECT id FROM shared_courses`)).toHaveLength(1);
	});
});

describe('saveReport', () => {
	it('keeps one open report per person and target', async () => {
		const { t, id } = await world();
		const form = () => {
			const f = new FormData();
			f.set('reason', '不適切な内容');
			return f;
		};
		expect(await saveReport(t.db, 'u2', 'shared_course', id, form())).toBeNull();
		expect(await saveReport(t.db, 'u2', 'shared_course', id, form())).toMatch(/すでに/);
		expect(await saveReport(t.db, 'u3', 'shared_course', id, form())).toBeNull();
	});
});

describe('cancelMarkers', () => {
	it('names who marked the day as cancelled', async () => {
		const { t, id } = await world();
		expect(await cancelMarkers(t.db, `${id}|2026-10-07`)).toEqual([{ id: 'troll', nickname: 'あらし' }]);
		expect(await cancelMarkers(t.db, `${id}|2026-10-08`)).toEqual([]);
	});
});

describe('adminSearchShared', () => {
	it('narrows by weekday and period, a period inside a longer class included', async () => {
		const { t } = await world();
		const add = writeShared(t.db, { userId: 'u2', universityId: 'uni', year: 2026, termNames: [], existing: null, values: values('長い授業', 3, 2, 2) });
		await t.db.batch(add.statements as [never]);
		const titles = async (o: { weekday?: number; period?: number }) =>
			(await adminSearchShared(t.db, { universityId: 'uni', year: 2026, q: '', ...o })).map((c) => c.values.title);
		expect(await titles({ weekday: 3 })).toEqual(['長い授業']);
		expect(await titles({ period: 3 })).toEqual(['長い授業']);
		expect(await titles({ weekday: 1, period: 1 })).toEqual(['ひどい授業2']);
		expect(await titles({ weekday: 2 })).toEqual([]);
	});
});

describe('findOrCreateUniversity', () => {
	it('keeps who typed a new university in', async () => {
		const { t } = await world();
		const uni = await findOrCreateUniversity(t.db, 'あたらし大学', 'u2');
		expect(await getUserUniversity(t.db, uni!.id)).toMatchObject({ createdBy: 'u2', creator: 'ふつう' });
	});
});
