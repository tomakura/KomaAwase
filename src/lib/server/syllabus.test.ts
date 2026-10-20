// Taking the syllabus into the shared course data, and what people syncing it can change
import { describe, expect, it } from 'vitest';
import type { BatchItem } from 'drizzle-orm/batch';
import { testDatabase } from '../../test/db';
import { prepareCourse, commitCourses, type CourseInput } from './courses';
import { loadSharedCourses } from './shared-courses';
import { findSyllabusMatch, importBatches, memoStatements, parseSyllabusFile, planImport, type SyllabusFile } from './syllabus';

const FAR = Date.UTC(2099, 0, 1);

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name, email_domains) VALUES ('uni', 'テスト大学', '["u.ac.jp"]')`);
	t.run(`INSERT INTO users (id, email, university_id) VALUES ('u1', 'a@example.test', 'uni'), ('u2', 'b@example.test', 'uni')`);
	t.run(`INSERT INTO users (id, email, university_id, role) VALUES ('admin', 'c@example.test', 'uni', 'admin')`);
	t.run(
		`INSERT INTO univ_verifications (user_id, university_id, email, verified_at, expires_at) VALUES ('u1', 'uni', 'a@u.ac.jp', 0, ${FAR}), ('u2', 'uni', 'b@u.ac.jp', 0, ${FAR})`
	);
	t.run(`INSERT INTO timetables (id, user_id, year, name, university_id) VALUES ('t1', 'u1', 2026, '2026年度', 'uni'), ('t2', 'u2', 2026, '2026年度', 'uni')`);
	t.run(`INSERT INTO terms (id, timetable_id, name, sort_order) VALUES ('q3a', 't1', 'Q3', 0), ('q3b', 't2', 'Q3', 0)`);
	// Someone added this before the syllabus came in, with a room; one person syncs it
	t.run(`INSERT INTO shared_courses (id, university_id, year, title, source, terms) VALUES ('mine', 'uni', 2026, '演習 A', 'user', '["Q3"]')`);
	t.run(`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES ('ms', 'mine', 2, 3, 2, 'E15')`);
	t.run(`INSERT INTO courses (id, timetable_id, title, sync_mode, shared_course_id) VALUES ('c1', 't1', '演習 A', 'synced', 'mine')`);
	return t;
}

const course = (over: Partial<SyllabusFile['courses'][number]> = {}) => ({
	code: '1001',
	title: '演習A',
	terms: ['Q3'],
	teachers: ['先生 A'],
	slots: [{ weekday: 2, period: 3, span: 2, week: 'every' as const }],
	delivery: null,
	intensiveFrom: null,
	intensiveTo: null,
	credits: 2,
	online: false,
	outline: '授業概要\n概要',
	schedule: '第1回\nはじめに',
	link: null,
	...over
});

async function importFile(t: ReturnType<typeof world>, courses: ReturnType<typeof course>[]) {
	const file = parseSyllabusFile({ year: 2026, courses });
	if ('message' in file) throw new Error(file.message);
	const rows = t.rows(`SELECT id FROM shared_courses WHERE university_id = 'uni'`).map((r) => String(r.id));
	const plan = planImport(file, [...(await loadSharedCourses(t.db, rows)).values()]);
	if ('message' in plan) throw new Error(plan.message);
	for (const batch of await importBatches(t.db, plan, 'uni')) await t.db.batch(batch as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
	return plan;
}

describe('parseSyllabusFile', () => {
	it('says what is wrong', () => {
		expect(parseSyllabusFile({ year: 2026, courses: [] })).toEqual({ message: '授業がありません' });
		expect(parseSyllabusFile({ year: 2026, courses: [course(), course()] })).toEqual({ message: '2件目：授業コード 1001 が2回あります' });
		expect(parseSyllabusFile({ year: 2026, courses: [course({ slots: [{ weekday: 9, period: 1, span: 1, week: 'every' }] })] })).toEqual({
			message: '1件目（1001）：曜日・時限を確かめてください'
		});
	});
});

describe('importing the syllabus', () => {
	it('adds courses, with オンライン for an online class', async () => {
		const t = world();
		const plan = await importFile(t, [course({ code: '2002', title: '講義B', slots: [{ weekday: 1, period: 1, span: 1, week: 'odd' }], online: true })]);
		expect(plan.add).toHaveLength(1);
		expect(t.rows(`SELECT title, code, source, terms, credits, syllabus_outline FROM shared_courses WHERE code = '2002'`)).toEqual([
			{ title: '講義B', code: '2002', source: 'syllabus', terms: '["Q3"]', credits: 2, syllabus_outline: '授業概要\n概要' }
		]);
		expect(t.rows(`SELECT weekday, week_pattern, room FROM shared_course_slots s JOIN shared_courses c ON c.id = s.shared_course_id WHERE c.code = '2002'`)).toEqual([
			{ weekday: 1, week_pattern: 'odd', room: 'オンライン' }
		]);
	});

	it('links a course people added, keeping its room, and gives its timetables the memos', async () => {
		const t = world();
		const plan = await importFile(t, [course({ link: 'mine' })]);
		expect(plan.link).toHaveLength(1);
		expect(t.rows(`SELECT title, code, source, version FROM shared_courses WHERE id = 'mine'`)).toEqual([
			{ title: '演習A', code: '1001', source: 'syllabus', version: 2 }
		]);
		expect(t.rows(`SELECT room FROM shared_course_slots WHERE shared_course_id = 'mine'`)).toEqual([{ room: 'E15' }]);
		expect(t.rows(`SELECT name FROM shared_course_teachers WHERE shared_course_id = 'mine'`)).toEqual([{ name: '先生 A' }]);
		// The change is the syllabus's (no user), so the person syncing it sees it as changed
		expect(t.rows(`SELECT user_id FROM shared_course_edits WHERE shared_course_id = 'mine'`)).toEqual([{ user_id: null }]);
		expect(t.rows(`SELECT kind, body, date FROM course_notes WHERE course_id = 'c1' ORDER BY rowid`)).toEqual([
			{ kind: 'memo', body: '回ごとの授業内容\n\n第1回\nはじめに', date: null },
			{ kind: 'memo', body: '授業概要\n概要', date: null }
		]);
	});

	it('changes nothing the second time, and updates what the syllabus changed', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' })]);
		const again = await importFile(t, [course({ link: 'mine' })]);
		expect([again.add.length, again.update.length, again.link.length, again.same.length]).toEqual([0, 0, 0, 1]);
		const changed = await importFile(t, [course({ teachers: ['先生 B'] })]);
		expect(changed.update[0].changes).toEqual([{ label: '先生', before: '先生 A', after: '先生 B' }]);
		expect(t.rows(`SELECT name FROM shared_course_teachers WHERE shared_course_id = 'mine'`)).toEqual([{ name: '先生 B' }]);
		expect(t.rows(`SELECT room FROM shared_course_slots WHERE shared_course_id = 'mine'`)).toEqual([{ room: 'E15' }]);
		// Memos come only once
		expect(t.rows(`SELECT count(*) AS n FROM course_notes WHERE course_id = 'c1'`)).toEqual([{ n: 2 }]);
	});

	it('lists syllabus courses the file no longer has, and keeps them', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' }), course({ code: '3003', title: '講義C' })]);
		const plan = await importFile(t, [course()]);
		expect(plan.missing.map((m) => m.code)).toEqual(['3003']);
		expect(t.rows(`SELECT count(*) AS n FROM shared_courses WHERE code = '3003'`)).toEqual([{ n: 1 }]);
	});
});

const input = (over: Partial<CourseInput>): CourseInput => ({
	title: '演習A',
	teachers: ['先生 A'],
	color: 'blue',
	termIds: ['q3b'],
	slots: [{ weekday: 2, period: 3, span: 2, week: 'every', room: 'E15' }],
	delivery: null,
	intensiveFrom: null,
	intensiveTo: null,
	credits: 2,
	absenceLimit: null,
	syncMode: 'synced',
	sharedCourseId: 'mine',
	sharedVersion: null,
	...over
});

async function save(t: ReturnType<typeof world>, userId: string, courseId: string | null, over: Partial<CourseInput>) {
	const timetable = { id: userId === 'u1' ? 't1' : 't2', year: 2026, universityId: 'uni' };
	const terms = [{ id: userId === 'u1' ? 'q3a' : 'q3b', name: 'Q3' }];
	const prepared = await prepareCourse(t.db, { userId, timetable, terms, courseId, input: input({ termIds: [terms[0].id], ...over }) });
	if ('message' in prepared) throw new Error(prepared.message);
	const failed = await commitCourses(t.db, [prepared]);
	if (failed) throw new Error(failed.message);
	return prepared.id;
}

describe('a syllabus course in a timetable', () => {
	it('comes with the memos when added', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' })]);
		const id = await save(t, 'u2', null, {});
		expect(t.rows(`SELECT body FROM course_notes WHERE course_id = '${id}' ORDER BY rowid`).map((r) => r.body)).toEqual([
			'回ごとの授業内容\n\n第1回\nはじめに',
			'授業概要\n概要'
		]);
	});

	it('takes the room someone enters as they add it', async () => {
		const t = world();
		await importFile(t, [course({ code: '2002', title: '講義B', slots: [{ weekday: 1, period: 1, span: 1, week: 'every' }] })]);
		const sharedId = String(t.rows(`SELECT id FROM shared_courses WHERE code = '2002'`)[0].id);
		const id = await save(t, 'u2', null, { title: '講義B', sharedCourseId: sharedId, slots: [{ weekday: 1, period: 1, span: 1, week: 'every', room: 'B201' }] });
		expect(t.rows(`SELECT room FROM shared_course_slots WHERE shared_course_id = '${sharedId}'`)).toEqual([{ room: 'B201' }]);
		expect(t.rows(`SELECT sync_mode FROM courses WHERE id = '${id}'`)).toEqual([{ sync_mode: 'synced' }]);
	});

	it('keeps the syllabus values while synced; only the room changes', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' })]);
		await save(t, 'u1', 'c1', { title: 'ちがう名前', teachers: [], slots: [{ weekday: 2, period: 3, span: 1, week: 'odd', room: '遠隔' }] });
		expect(t.rows(`SELECT title FROM shared_courses WHERE id = 'mine'`)).toEqual([{ title: '演習A' }]);
		expect(t.rows(`SELECT span, week_pattern, room FROM shared_course_slots WHERE shared_course_id = 'mine'`)).toEqual([
			{ span: 2, week_pattern: 'every', room: 'オンライン' }
		]);
		expect(t.rows(`SELECT title, sync_mode FROM courses WHERE id = 'c1'`)).toEqual([{ title: '演習A', sync_mode: 'synced' }]);
	});

	it('can be changed freely as 自分だけで使う', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' })]);
		await save(t, 'u1', 'c1', { title: 'ちがう名前', syncMode: 'personal' });
		expect(t.rows(`SELECT title, sync_mode FROM courses WHERE id = 'c1'`)).toEqual([{ title: 'ちがう名前', sync_mode: 'personal' }]);
		expect(t.rows(`SELECT title FROM shared_courses WHERE id = 'mine'`)).toEqual([{ title: '演習A' }]);
	});
});

describe('findSyllabusMatch', () => {
	it('finds the syllabus course of the same name and slot', async () => {
		const t = world();
		await importFile(t, [course({ link: 'mine' }), course({ code: '1002', slots: [{ weekday: 4, period: 1, span: 1, week: 'every' }] })]);
		// The second period of the class is enough; the other course of that name meets on Thursday
		const found = await findSyllabusMatch(t.db, { universityId: 'uni', year: 2026, title: '演習 A', slots: [{ weekday: 2, period: 4 }] });
		expect(found?.id).toBe('mine');
		expect(await findSyllabusMatch(t.db, { universityId: 'uni', year: 2026, title: '演習A', slots: [{ weekday: 5, period: 1 }] })).toBeNull();
		expect(await findSyllabusMatch(t.db, { universityId: 'uni', year: 2026, title: '別の授業', slots: [{ weekday: 2, period: 3 }] })).toBeNull();
	});
});

describe('memoStatements', () => {
	it('keeps each insert under 100 bound values', () => {
		const t = testDatabase();
		const ids = Array.from({ length: 15 }, (_, i) => `c${i}`);
		const statements = memoStatements(t.db, ids, { outline: '授業概要\nx', schedule: '第1回 y' });
		expect(statements).toHaveLength(2);
		for (const s of statements) expect((s as unknown as { toSQL(): { params: unknown[] } }).toSQL().params.length).toBeLessThanOrEqual(100);
	});
});
