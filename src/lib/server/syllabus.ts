import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { isWeekPattern, type Delivery, type WeekPattern } from '$lib/courses';
import { sharedChanges, type SharedChange } from '$lib/shared-changes';
import { isDate } from '$lib/time';
import { ONLINE_ROOM, cleanText } from '$lib/text';
import { MEMO_MAX } from '$lib/notes';
import type { Db } from './db';
import { courseNotes, courses, sharedCourseEdits, sharedCourseSlots, sharedCourseTeachers, sharedCourses } from './db/schema';
import { cleanValues, insertDetails, loadSharedCourses, normalize, type SharedCourse, type SharedValues } from './shared-courses';

/**
 * One course of the syllabus, as scripts/syllabus writes it. Rooms aren't in the syllabus:
 * people fill them in, and an online class gets オンライン. `link` is the id of a shared course
 * people added that is this course, which then becomes the syllabus course (decided by hand).
 */
export type SyllabusCourse = {
	code: string;
	title: string;
	terms: string[];
	teachers: string[];
	slots: { weekday: number; period: number; span: number; week: WeekPattern }[];
	delivery: Delivery | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
	credits: number | null;
	online: boolean;
	outline: string | null;
	schedule: string | null;
	link: string | null;
};

export type SyllabusFile = { year: number; courses: SyllabusCourse[] };

const CODE_MAX = 30;
const TITLE_MAX = 60;
const TEACHER_MAX = 30;
const TEACHERS_MAX = 10;
const TERM_MAX = 10;
const SLOTS_MAX = 14;
// What one import may hold; a university's year is well under it
const COURSES_MAX = 5000;

const length = (s: string) => [...s].length;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const longText = (v: unknown) => str(v).replace(/\r\n?/g, '\n').trim().slice(0, MEMO_MAX) || null;

/** The file the admin uploads, checked; a message says what is wrong with it */
export function parseSyllabusFile(raw: unknown): SyllabusFile | { message: string } {
	if (!raw || typeof raw !== 'object') return { message: 'ファイルの形がちがいます' };
	const { year, courses: list } = raw as { year?: unknown; courses?: unknown };
	if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) return { message: '年度がありません' };
	if (!Array.isArray(list) || !list.length) return { message: '授業がありません' };
	if (list.length > COURSES_MAX) return { message: `授業は${COURSES_MAX}件までです` };
	const out: SyllabusCourse[] = [];
	const codes = new Set<string>();
	for (const [i, item] of list.entries()) {
		const at = `${i + 1}件目`;
		const c = (item ?? {}) as Record<string, unknown>;
		const code = cleanText(str(c.code));
		if (!code || length(code) > CODE_MAX) return { message: `${at}：授業コードがありません` };
		if (codes.has(code)) return { message: `${at}：授業コード ${code} が2回あります` };
		codes.add(code);
		const title = cleanText(str(c.title));
		if (!title || length(title) > TITLE_MAX) return { message: `${at}（${code}）：授業名は1〜${TITLE_MAX}文字です` };
		const teachers = [...new Set((Array.isArray(c.teachers) ? c.teachers : []).map((t) => cleanText(str(t))))].filter(Boolean);
		if (teachers.length > TEACHERS_MAX || teachers.some((t) => length(t) > TEACHER_MAX)) {
			return { message: `${at}（${code}）：先生が多すぎるか、名前が長すぎます` };
		}
		const terms = [...new Set((Array.isArray(c.terms) ? c.terms : []).map((t) => cleanText(str(t))))].filter(Boolean);
		if (terms.some((t) => length(t) > TERM_MAX)) return { message: `${at}（${code}）：学期の名前が長すぎます` };
		const slots = (Array.isArray(c.slots) ? c.slots : []).map((s) => s as Record<string, unknown>);
		const okSlot = (s: Record<string, unknown>) =>
			[s.weekday, s.period, s.span].every((n) => typeof n === 'number' && Number.isInteger(n)) &&
			(s.weekday as number) >= 1 &&
			(s.weekday as number) <= 7 &&
			(s.period as number) >= 1 &&
			(s.period as number) <= 12 &&
			(s.span as number) >= 1 &&
			(s.span as number) <= 4 &&
			(s.week === undefined || isWeekPattern(s.week));
		if (slots.length > SLOTS_MAX || !slots.every(okSlot)) return { message: `${at}（${code}）：曜日・時限を確かめてください` };
		const delivery = c.delivery === 'ondemand' || c.delivery === 'intensive' ? c.delivery : null;
		const from = str(c.intensiveFrom) || null;
		const to = str(c.intensiveTo) || null;
		if ((from && !isDate(from)) || (to && !isDate(to))) return { message: `${at}（${code}）：集中講義の日付を確かめてください` };
		const credits = typeof c.credits === 'number' && c.credits >= 0 && c.credits <= 20 ? c.credits : null;
		out.push({
			code,
			title,
			terms,
			teachers,
			slots: slots
				.map((s) => ({
					weekday: s.weekday as number,
					period: s.period as number,
					span: s.span as number,
					week: (s.week ?? 'every') as WeekPattern
				}))
				.sort((a, b) => a.weekday - b.weekday || a.period - b.period),
			// A course without slots is on demand unless it is intensive
			delivery: slots.length ? null : (delivery ?? 'ondemand'),
			intensiveFrom: !slots.length && delivery === 'intensive' ? from : null,
			intensiveTo: !slots.length && delivery === 'intensive' ? to : null,
			credits,
			online: c.online === true,
			outline: longText(c.outline),
			schedule: longText(c.schedule),
			link: str(c.link) || null
		});
	}
	return { year, courses: out };
}

/**
 * The shared values of a syllabus course. Rooms come from `before` (what people entered) for
 * the slots that are still there; an online class without one gets オンライン.
 */
export function syllabusValues(c: SyllabusCourse, before: SharedValues['slots'] = []): SharedValues {
	return cleanValues(
		normalize({
			title: c.title,
			teachers: c.teachers,
			slots: c.slots.map((s) => ({
				...s,
				room: before.find((b) => b.weekday === s.weekday && b.period === s.period)?.room ?? (c.online ? ONLINE_ROOM : null)
			})),
			delivery: c.delivery,
			intensiveFrom: c.intensiveFrom,
			intensiveTo: c.intensiveTo,
			credits: c.credits
		})
	);
}

/**
 * The syllabus values of `shared` with the rooms (and only the rooms) of `slots`, matched by
 * weekday and period: what someone syncing a syllabus course can change.
 */
export function withRooms(shared: SharedValues, slots: { weekday: number; period: number; room: string | null }[]): SharedValues {
	return {
		...shared,
		slots: shared.slots.map((s) => ({
			...s,
			room: slots.find((x) => x.weekday === s.weekday && x.period === s.period)?.room ?? null
		}))
	};
}

/**
 * The two memos a timetable gets with a syllabus course, in the order they are added (the last
 * shows on top). The outline already starts with its headings (授業概要, 到達目標).
 */
export function syllabusMemos(c: { outline: string | null; schedule: string | null }) {
	return [c.schedule && `回ごとの授業内容\n\n${c.schedule}`, c.outline].flatMap((body) => (body ? [body.slice(0, MEMO_MAX)] : []));
}

/** Statements that give these courses (of the user's timetables) the syllabus memos */
export function memoStatements(db: Db, courseIds: string[], c: { outline: string | null; schedule: string | null }): BatchItem<'sqlite'>[] {
	const bodies = syllabusMemos(c);
	if (!bodies.length || !courseIds.length) return [];
	const rows = courseIds.flatMap((courseId) => bodies.map((body) => ({ courseId, kind: 'memo' as const, body })));
	// D1 takes at most 100 bound values per query: 5 a row here, with the id and done that drizzle fills in
	const ROWS = 20;
	const statements: BatchItem<'sqlite'>[] = [];
	for (let i = 0; i < rows.length; i += ROWS) statements.push(db.insert(courseNotes).values(rows.slice(i, i + ROWS)));
	return statements;
}

const sameTerms = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

export type ImportPlan = {
	year: number;
	// New shared courses
	add: SyllabusCourse[];
	// Syllabus courses whose values change, and what changes
	update: { course: SyllabusCourse; existing: SharedCourse; changes: SharedChange[] }[];
	// Shared courses people added that become these syllabus courses
	link: { course: SyllabusCourse; existing: SharedCourse; changes: SharedChange[] }[];
	// Syllabus courses that stay as they are (their memo texts may still be read again)
	same: { course: SyllabusCourse; existing: SharedCourse }[];
	// Syllabus courses of the year that the file doesn't have any more: kept, only listed
	missing: SharedCourse[];
};

/** What importing the file does to the university's shared courses of its year (`existing`) */
export function planImport(file: SyllabusFile, existing: SharedCourse[]): ImportPlan | { message: string } {
	const byCode = new Map(existing.filter((e) => e.code).map((e) => [e.code!, e]));
	const byId = new Map(existing.map((e) => [e.id, e]));
	const plan: ImportPlan = { year: file.year, add: [], update: [], link: [], same: [], missing: [] };
	const linked = new Set<string>();
	for (const course of file.courses) {
		const found = byCode.get(course.code);
		if (course.link && !found) {
			const target = byId.get(course.link);
			if (!target || target.source !== 'user' || target.code) {
				return { message: `${course.code}：つなぐ授業が見つからないか、もうシラバスの授業です` };
			}
			if (linked.has(target.id)) return { message: `${course.code}：同じ授業を2つのシラバスの授業につなごうとしています` };
			linked.add(target.id);
			const after = syllabusValues(course, target.values.slots);
			plan.link.push({ course, existing: target, changes: sharedChanges(target.values, after) });
		} else if (found) {
			const after = syllabusValues(course, found.values.slots);
			const changes = sharedChanges(found.values, after);
			if (JSON.stringify(found.values) !== JSON.stringify(after) || !sameTerms(found.terms, course.terms)) {
				plan.update.push({ course, existing: found, changes });
			} else {
				plan.same.push({ course, existing: found });
			}
		} else {
			plan.add.push(course);
		}
	}
	const codes = new Set(file.courses.map((c) => c.code));
	plan.missing = existing.filter((e) => e.source === 'syllabus' && e.code && !codes.has(e.code));
	return plan;
}

// The version guard of shared-courses.ts: the batch stops (and rolls back) if someone saved in between
function guarded(db: Db, existing: SharedCourse, set: Partial<typeof sharedCourses.$inferInsert>): BatchItem<'sqlite'>[] {
	return [
		db
			.update(sharedCourses)
			.set(set)
			.where(and(eq(sharedCourses.id, existing.id), eq(sharedCourses.version, existing.version))),
		db.run(sql`select json(case when changes() = 1 then 'true' else 'version conflict' end)`)
	];
}

/**
 * The statements of an import, a batch per few courses (each batch is all or nothing; the file
 * can be imported again and picks up where it stopped, since courses are matched by code).
 * Changes are recorded with no user, as the syllabus's, so everyone syncing sees them.
 * Timetables that had a course people added get the syllabus memos when it is linked.
 */
export async function importBatches(db: Db, plan: ImportPlan, universityId: string, now = new Date()) {
	const batches: BatchItem<'sqlite'>[][] = [];
	let current: BatchItem<'sqlite'>[] = [];
	const push = (statements: BatchItem<'sqlite'>[]) => {
		current.push(...statements);
		if (current.length >= 300) {
			batches.push(current);
			current = [];
		}
	};
	const text = (c: SyllabusCourse) => ({
		syllabusOutline: c.outline,
		syllabusSchedule: c.schedule,
		syllabusCheckedAt: now
	});
	const fields = (c: SyllabusCourse, v: SharedValues) => ({
		code: c.code,
		title: v.title,
		terms: c.terms,
		delivery: v.delivery,
		intensiveFrom: v.intensiveFrom,
		intensiveTo: v.intensiveTo,
		credits: v.credits,
		source: 'syllabus' as const,
		...text(c)
	});

	for (const course of plan.add) {
		const id = crypto.randomUUID();
		const v = syllabusValues(course);
		push([
			db.insert(sharedCourses).values({ id, universityId, year: plan.year, ...fields(course, v), createdAt: now, updatedAt: now }),
			...insertDetails(db, id, v),
			db.insert(sharedCourseEdits).values({ sharedCourseId: id, userId: null, diff: { before: null, after: v } })
		]);
	}

	const linkedCourses = plan.link.length
		? await db
				.select({ id: courses.id, sharedCourseId: courses.sharedCourseId })
				.from(courses)
				.where(inArray(courses.sharedCourseId, plan.link.slice(0, 90).map((l) => l.existing.id)))
		: [];
	if (plan.link.length > 90) throw new Error('too many links in one import');

	for (const { course, existing } of [...plan.update, ...plan.link]) {
		const v = syllabusValues(course, existing.values.slots);
		const isLink = plan.link.some((l) => l.existing.id === existing.id);
		push([
			...guarded(db, existing, { ...fields(course, v), version: existing.version + 1, updatedAt: now }),
			db.delete(sharedCourseSlots).where(eq(sharedCourseSlots.sharedCourseId, existing.id)),
			db.delete(sharedCourseTeachers).where(eq(sharedCourseTeachers.sharedCourseId, existing.id)),
			...insertDetails(db, existing.id, v),
			db.insert(sharedCourseEdits).values({ sharedCourseId: existing.id, userId: null, diff: { before: existing.values, after: v } }),
			...(isLink
				? memoStatements(
						db,
						linkedCourses.filter((c) => c.sharedCourseId === existing.id).map((c) => c.id),
						course
					)
				: [])
		]);
	}

	// Nothing people see changes: only the memo texts and when the syllabus was read
	for (const { course, existing } of plan.same) {
		push([db.update(sharedCourses).set(text(course)).where(eq(sharedCourses.id, existing.id))]);
	}
	if (current.length) batches.push(current);
	return batches;
}

const bare = (title: string) => cleanText(title).replaceAll(' ', '');

/**
 * The syllabus course a course of someone's own (自分だけで使う, not linked) seems to be: one of
 * the university's that year with the same name (spaces aside) and a slot in common, or no
 * slots on either. Null when there is none or it can't tell which.
 */
export async function findSyllabusMatch(
	db: Db,
	course: { universityId: string; year: number; title: string; slots: { weekday: number; period: number; span?: number }[] }
) {
	const rows = await db
		.select({ id: sharedCourses.id, title: sharedCourses.title })
		.from(sharedCourses)
		.where(
			and(
				eq(sharedCourses.universityId, course.universityId),
				eq(sharedCourses.year, course.year),
				eq(sharedCourses.source, 'syllabus')
			)
		);
	const ids = rows.filter((r) => bare(r.title) === bare(course.title)).map((r) => r.id);
	if (!ids.length) return null;
	const found = [...(await loadSharedCourses(db, ids.slice(0, 90))).values()].filter((s) =>
		course.slots.length
			? s.values.slots.some((a) =>
					course.slots.some((b) => a.weekday === b.weekday && a.period < b.period + (b.span ?? 1) && b.period < a.period + a.span)
				)
			: !s.values.slots.length
	);
	return found.length === 1 ? found[0] : null;
}
