// What the review of read courses needs on the server, for screenshots and CSV files alike:
// the shared courses that may be the same class, the courses already in the timetable, and
// the save.
import { error, fail } from '@sveltejs/kit';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { COURSE_COLORS } from '$lib/courses';
import { IMPORT_COURSES_MAX, type groupImported } from '$lib/import';
import type { Existing } from '$lib/import-review';
import { normalizeTitle } from '$lib/overlay';
import type { Db } from '../db';
import { commitCourses, nextColor, parseCourseForm, prepareCourse, shapeOf } from '../courses';
import { courseSlots, courseTeachers, courses, sharedCourseSlots, sharedCourses } from '../db/schema';
import { loadSharedCourses } from '../shared-courses';
import { loadShape, loadTimetable } from '../timetable';
import { sharedAccess } from '../verify';

type Timetable = { id: string; year: number; universityId: string | null };

// Shared courses at the slots that were read, best matches first
export async function suggestions(db: Db, timetable: Timetable, groups: ReturnType<typeof groupImported>) {
	const pairs = [...new Set(groups.flatMap((g) => g.slots.map((s) => `${s.weekday}-${s.period}`)))].slice(0, 40);
	if (!timetable.universityId || !pairs.length) return groups.map(() => []);
	const rows = await db
		.selectDistinct({ id: sharedCourses.id, weekday: sharedCourseSlots.weekday, period: sharedCourseSlots.periodNumber })
		.from(sharedCourseSlots)
		.innerJoin(sharedCourses, eq(sharedCourses.id, sharedCourseSlots.sharedCourseId))
		.where(
			and(
				eq(sharedCourses.universityId, timetable.universityId),
				eq(sharedCourses.year, timetable.year),
				or(
					...pairs.map((p) => {
						const [w, n] = p.split('-').map(Number);
						return and(eq(sharedCourseSlots.weekday, w), eq(sharedCourseSlots.periodNumber, n));
					})
				)
			)
		);
	const shared = await loadSharedCourses(
		db,
		rows.map((r) => r.id)
	);
	return groups.map((g) => {
		const here = new Set(
			rows.filter((r) => g.slots.some((s) => s.weekday === r.weekday && s.period === r.period)).map((r) => r.id)
		);
		const title = normalizeTitle(g.title);
		return [...here]
			.flatMap((id) => {
				const course = shared.get(id);
				if (!course) return [];
				const other = normalizeTitle(course.values.title);
				const score = other === title ? 3 : other.includes(title) || title.includes(other) ? 2 : 1;
				return [{ id, version: course.version, terms: course.terms, score, ...course.values }];
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);
	});
}

/** The timetable's terms and periods, and its courses as they show, to compare what was read with */
export async function reviewBase(db: Db, timetable: Timetable, today: string) {
	const loaded = await loadTimetable(db, timetable.id, today);
	const ids = loaded.courses.map((c) => c.id);
	const [modes, teachers] = ids.length
		? await db.batch([
				db.select({ id: courses.id, syncMode: courses.syncMode }).from(courses).where(eq(courses.timetableId, timetable.id)),
				db
					.select({ courseId: courseTeachers.courseId, name: courseTeachers.name })
					.from(courseTeachers)
					.innerJoin(courses, eq(courses.id, courseTeachers.courseId))
					.where(eq(courses.timetableId, timetable.id))
					.orderBy(courseTeachers.sortOrder)
			])
		: [[], []];
	const existing: Existing[] = loaded.courses.map((c) => {
		const synced = modes.find((m) => m.id === c.id)?.syncMode === 'synced';
		return {
			id: c.id,
			title: c.title,
			synced,
			slots: c.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, room: s.room })),
			// A synced course's teachers are the shared course's; they are never changed from here
			teachers: synced ? [] : teachers.filter((t) => t.courseId === c.id).map((t) => t.name),
			termIds: c.termIds
		};
	});
	return { terms: loaded.terms, periods: loaded.periods, existing };
}

type Row = {
	title: string;
	teachers: string[];
	slots: Record<string, unknown>[];
	credits: number | null;
	sharedId: string | null;
	// A course already in the timetable to set to what was read, instead of adding one
	updateId: string | null;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const UNREADABLE = '入力を読み取れませんでした。もう一度やり直してください';

/**
 * Saves the reviewed courses: new ones added, chosen ones in the timetable set to what was
 * read. All are checked before any is written, and `first` goes in the same batch (an import
 * closing itself), so it all happens or none of it does. A fail() comes back on a mistake.
 */
export async function saveReviewed(
	db: Db,
	userId: string,
	timetable: Timetable,
	form: FormData,
	first: BatchItem<'sqlite'>[] = []
) {
	let raw: unknown;
	try {
		raw = JSON.parse(String(form.get('rows') ?? '[]'));
	} catch {
		return fail(400, { message: UNREADABLE });
	}
	if (!Array.isArray(raw) || !raw.length) return fail(400, { message: '追加する授業を1つ以上選んでください' });
	if (!raw.every((r) => isObject(r) && (r.slots === undefined || (Array.isArray(r.slots) && r.slots.every(isObject))))) {
		return fail(400, { message: UNREADABLE });
	}
	// Checked field by field again below (parseCourseForm); here only the shape
	const rows: Row[] = raw.slice(0, IMPORT_COURSES_MAX).map((r) => ({
		title: typeof r?.title === 'string' ? r.title : '',
		teachers: Array.isArray(r?.teachers) ? r.teachers.filter((t: unknown) => typeof t === 'string') : [],
		slots: Array.isArray(r?.slots) ? r.slots : [],
		credits: typeof r?.credits === 'number' ? r.credits : null,
		sharedId: typeof r?.sharedId === 'string' ? r.sharedId : null,
		updateId: typeof r?.updateId === 'string' ? r.updateId : null
	}));
	const termIds = form.getAll('term').map(String);
	const sync = form.get('sync') === 'on';

	const shape = await loadShape(db, timetable.id);
	const shared = await loadSharedCourses(
		db,
		rows.flatMap((r) => (r.sharedId && !r.updateId ? [r.sharedId] : []))
	);
	// Courses to update must be this timetable's own, not synced
	const updateIds = rows.flatMap((r) => (r.updateId ? [r.updateId] : []));
	const owned = updateIds.length
		? await db
				.select({ id: courses.id, title: courses.title, color: courses.color, syncMode: courses.syncMode })
				.from(courses)
				.where(and(eq(courses.timetableId, timetable.id), inArray(courses.id, updateIds)))
		: [];
	const oldSlots = owned.length
		? await db.select().from(courseSlots).where(inArray(courseSlots.courseId, owned.map((c) => c.id)))
		: [];
	const colors = COURSE_COLORS.filter((c) => c.id !== 'gray').map((c) => c.id);
	const firstColor = colors.indexOf((await nextColor(db, timetable.id)) as (typeof colors)[number]);

	const inputs = [];
	const updates: BatchItem<'sqlite'>[] = [];
	let added = 0;
	for (const [i, row] of rows.entries()) {
		const label = (title: string) => `${i + 1}つめ（${title || '名前なし'}）`;
		if (row.updateId) {
			const course = owned.find((c) => c.id === row.updateId);
			if (!course || course.syncMode === 'synced') error(400, '直す授業が見つかりません');
			const fd = new FormData();
			fd.set('title', course.title);
			fd.set('color', course.color);
			// The terms aren't changed; any of the timetable's passes the check
			fd.set('term', shape.terms[0]?.id ?? '');
			for (const t of row.teachers) fd.append('teacher', t);
			for (const s of row.slots) {
				// A slot that was there keeps whether it is every week or every other
				const was = oldSlots.find((o) => o.courseId === course.id && o.weekday === s.weekday && o.periodNumber === s.period);
				fd.append('slot', JSON.stringify({ ...s, room: s.room || null, week: was?.weekPattern ?? 'every' }));
			}
			const parsed = parseCourseForm(fd, shapeOf(shape));
			if ('message' in parsed) return fail(400, { message: `${label(course.title)}：${parsed.message}` });
			const { slots, teachers } = parsed.input;
			updates.push(
				db.delete(courseSlots).where(eq(courseSlots.courseId, course.id)),
				db.delete(courseTeachers).where(eq(courseTeachers.courseId, course.id))
			);
			if (slots.length) {
				updates.push(
					db.insert(courseSlots).values(
						slots.map((s) => ({ courseId: course.id, weekday: s.weekday, periodNumber: s.period, span: s.span, weekPattern: s.week, room: s.room }))
					)
				);
			}
			if (teachers.length) {
				updates.push(db.insert(courseTeachers).values(teachers.map((name, sortOrder) => ({ courseId: course.id, name, sortOrder }))));
			}
			if (row.credits !== null) updates.push(db.update(courses).set({ credits: row.credits }).where(eq(courses.id, course.id)));
			continue;
		}
		const linked = row.sharedId ? shared.get(row.sharedId) : undefined;
		// Linked to a shared course: its own values, so a misread never overwrites it
		const values = linked ? linked.values : { ...row, slots: row.slots.map((s) => ({ ...s, room: s.room || null })) };
		const fd = new FormData();
		fd.set('title', values.title);
		for (const t of values.teachers) fd.append('teacher', t);
		fd.set('color', colors[(firstColor + added++) % colors.length]);
		for (const id of termIds) fd.append('term', id);
		for (const s of values.slots) fd.append('slot', JSON.stringify(s));
		if (!linked && row.credits !== null) fd.set('credits', String(row.credits));
		fd.set('sync', linked || sync ? 'synced' : 'personal');
		if (linked) {
			fd.set('shared_id', linked.id);
			fd.set('shared_version', String(linked.version));
		}
		const parsed = parseCourseForm(fd, shapeOf(shape));
		if ('message' in parsed) return fail(400, { message: `${label(values.title)}：${parsed.message}` });
		inputs.push(parsed.input);
	}

	const sharedAllowed = (await sharedAccess(db, userId, timetable.universityId)) === 'ok';
	const prepared = [];
	for (const input of inputs) {
		const course = await prepareCourse(db, { userId, timetable, terms: shape.terms, courseId: null, input, sharedAllowed });
		if ('message' in course) return fail(409, { message: course.message });
		prepared.push(course);
	}
	const failed = await commitCourses(db, prepared, [...first, ...updates]);
	if (failed) return fail(409, failed);
	return { termId: termIds[0] ?? null };
}
