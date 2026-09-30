import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ABSENCE_LIMIT_MAX, COURSE_COLORS, CREDITS_MAX, isCourseColor, readNumber, isWeekPattern, type Delivery, type WeekPattern } from '$lib/courses';
import { isDate } from '$lib/time';
import type { Db } from './db';
import { courseAbsences, courseSlots, courseTeachers, courseTerms, courses, timetables } from './db/schema';
import { deleteCourseFiles } from './files';
import { loadNotes } from './notes';
import { canEditShared, loadSharedCourse, sharedCourseQueries, sharedCoursesFrom, writeShared, type SharedCourse } from './shared-courses';
import { loadShape, shapeQueries } from './timetable';
import { sharedAccess } from './verify';

const TITLE_MAX = 60;
const TEACHER_MAX = 30;
const TEACHERS_MAX = 10;
const ROOM_MAX = 20;
const SLOTS_MAX = 14;

export type SlotInput = { weekday: number; period: number; span: number; week: WeekPattern; room: string | null };

export type CourseInput = {
	title: string;
	teachers: string[];
	color: string;
	termIds: string[];
	slots: SlotInput[]; // empty for on-demand and intensive courses
	delivery: Delivery | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
	credits: number | null; // shared by everyone syncing the course
	absenceLimit: number | null; // personal
	syncMode: 'synced' | 'personal';
	sharedCourseId: string | null; // the shared course it came from, if any
	sharedVersion: number | null; // the version of it the form showed
};

// What a submitted course is checked against
export type Shape = { termIds: string[]; periods: number[] };

export function shapeOf(shape: Awaited<ReturnType<typeof loadShape>>): Shape {
	return { termIds: shape.terms.map((t) => t.id), periods: shape.periods.map((p) => p.number) };
}

const length = (s: string) => [...s].length;

export function parseCourseForm(form: FormData, shape: Shape): { input: CourseInput } | { message: string } {
	const title = String(form.get('title') ?? '').trim();
	if (!title || length(title) > TITLE_MAX) return { message: `授業名は1〜${TITLE_MAX}文字で入れてください` };

	const teachers = [...new Set(form.getAll('teacher').map((t) => String(t).trim()))].filter(Boolean);
	if (teachers.length > TEACHERS_MAX || teachers.some((t) => length(t) > TEACHER_MAX)) {
		return { message: `先生は${TEACHERS_MAX}人まで、名前は${TEACHER_MAX}文字までです` };
	}

	const color = String(form.get('color') ?? '');
	if (!isCourseColor(color)) return { message: '色を選んでください' };

	const termIds = [...new Set(form.getAll('term').map(String))];
	if (!termIds.length || termIds.some((id) => !shape.termIds.includes(id))) {
		return { message: '開講する学期を選んでください' };
	}

	const credits = readNumber(form.get('credits'), CREDITS_MAX, 0.5);
	const absenceLimit = readNumber(form.get('absence_limit'), ABSENCE_LIMIT_MAX, 1);
	if (credits === 'invalid') return { message: `単位数は0〜${CREDITS_MAX}で、0.5単位きざみで入れてください` };
	if (absenceLimit === 'invalid') return { message: `欠席の上限は1〜${ABSENCE_LIMIT_MAX}回で入れてください` };

	const version = Number(form.get('shared_version'));
	const sync = {
		syncMode: form.get('sync') === 'synced' ? ('synced' as const) : ('personal' as const),
		sharedCourseId: String(form.get('shared_id') ?? '') || null,
		sharedVersion: Number.isInteger(version) && version > 0 ? version : null
	};

	if (form.get('unscheduled') === 'on') {
		const delivery = form.get('delivery') === 'intensive' ? 'intensive' : 'ondemand';
		const from = delivery === 'intensive' ? String(form.get('intensive_from') ?? '') || null : null;
		const to = delivery === 'intensive' ? String(form.get('intensive_to') ?? '') || null : null;
		if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && to < from)) {
			return { message: '集中講義の期間を確かめてください' };
		}
		return {
			input: { title, teachers, color, termIds, slots: [], delivery, intensiveFrom: from, intensiveTo: to, credits, absenceLimit, ...sync }
		};
	}

	const slots = parseSlots(form.getAll('slot'), shape.periods);
	if (typeof slots === 'string') return { message: slots };
	if (!slots.length) {
		return { message: '曜日・時限を1つ以上入れるか、「曜日・時限がない」にチェックしてください' };
	}
	return {
		input: { title, teachers, color, termIds, slots, delivery: null, intensiveFrom: null, intensiveTo: null, credits, absenceLimit, ...sync }
	};
}

// Slots arrive as JSON, one per field. They must fit in the timetable and not overlap.
function parseSlots(values: FormDataEntryValue[], periods: number[]): SlotInput[] | string {
	const invalid = '曜日・時限を確かめてください';
	if (values.length > SLOTS_MAX) return `曜日・時限は${SLOTS_MAX}個までです`;
	const slots: (SlotInput & { start: number })[] = [];
	for (const value of values) {
		let raw: { weekday?: unknown; period?: unknown; span?: unknown; week?: unknown; room?: unknown };
		try {
			raw = JSON.parse(String(value)) ?? {};
		} catch {
			return invalid;
		}
		const { weekday, period, span } = raw;
		if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return invalid;
		if (typeof span !== 'number' || !Number.isInteger(span) || span < 1) return invalid;
		const start = periods.indexOf(period as number);
		if (start < 0 || start + span > periods.length) return invalid;
		const room = typeof raw.room === 'string' ? raw.room.trim() : '';
		if (length(room) > ROOM_MAX) return `教室は${ROOM_MAX}文字までです`;
		// Slots sent without it (older pages, imports) meet every week.
		const week = raw.week === undefined ? 'every' : raw.week;
		if (!isWeekPattern(week)) return invalid;
		const overlaps = slots.some(
			(s) => s.weekday === weekday && s.start <= start + span - 1 && start <= s.start + s.span - 1
		);
		if (overlaps) return '同じ曜日で時限が重なっています';
		slots.push({ weekday, period: period as number, span, week, room: room || null, start });
	}
	return slots
		.sort((a, b) => a.weekday - b.weekday || a.start - b.start)
		.map(({ start: _, ...s }) => s);
}

// Rotates through the colors (gray last) so new courses don't all look the same.
export async function nextColor(db: Db, timetableId: string) {
	const row = await db.select({ n: count() }).from(courses).where(eq(courses.timetableId, timetableId)).get();
	const colors = COURSE_COLORS.filter((c) => c.id !== 'gray');
	return colors[(row?.n ?? 0) % colors.length].id;
}

const CONFLICT =
	'ほかの人が先にこの授業を直しました。画面を読み込み直すと最新の内容になるので、もう一度直して保存してください';

const NEEDS_CHECK = 'みんなの授業データは、在籍確認をすると使えます。「その他」→「在籍確認」からできます';

type SaveArgs = {
	userId: string;
	timetable: { id: string; year: number; universityId: string | null };
	terms: { id: string; name: string }[];
	courseId: string | null;
	input: CourseInput;
	// Whether the user may use the shared data of their university (sharedAccess); read here when not given
	sharedAllowed?: boolean;
};

type PreparedCourse = { id: string; existing: SharedCourse | null; statements: BatchItem<'sqlite'>[] };

// Saves the course in the timetable. A synced course also adds itself to the shared data, or
// updates the shared course it is linked to. The local copy is always written, so switching to
// 自分だけで使う keeps the latest values. Returns a message instead when the shared course
// changed after the form was opened, so nobody overwrites an edit they haven't seen.
export async function saveCourse(db: Db, args: SaveArgs) {
	const prepared = await prepareCourse(db, args);
	if ('message' in prepared) return prepared;
	return (await commitCourses(db, [prepared])) ?? { id: prepared.id };
}

/** The statements that save one course, so several can go in one batch (commitCourses). */
export async function prepareCourse(
	db: Db,
	{ userId, timetable, terms, courseId, input, sharedAllowed }: SaveArgs
): Promise<PreparedCourse | { message: string }> {
	const existing = input.sharedCourseId ? await loadSharedCourse(db, input.sharedCourseId) : null;
	if (
		input.sharedCourseId &&
		(existing?.universityId !== timetable.universityId || existing?.year !== timetable.year)
	) {
		error(400, 'つながっている授業が見つかりません');
	}
	// The shared data is for people with a current enrollment check. A course already linked
	// stays so (its values are still read); new links and new shared courses need the check.
	const allowed = async () => (sharedAllowed ??= (await sharedAccess(db, userId, timetable.universityId)) === 'ok');
	if (existing) {
		const linked = courseId
			? await db
					.select({ id: courses.sharedCourseId })
					.from(courses)
					.where(and(eq(courses.id, courseId), eq(courses.timetableId, timetable.id)))
					.get()
			: null;
		if (linked?.id !== existing.id && !(await allowed())) return { message: NEEDS_CHECK };
	}

	let sharedCourseId = existing?.id ?? null;
	let syncMode = input.syncMode;
	const shared: BatchItem<'sqlite'>[] = [];
	if (syncMode === 'synced' && !existing && !(await allowed())) syncMode = 'personal';
	if (syncMode === 'synced') {
		if (!timetable.universityId) error(400, '大学が決まっていないので同期できません');
		const written = writeShared(db, {
			userId,
			universityId: timetable.universityId,
			year: timetable.year,
			termNames: terms.filter((t) => input.termIds.includes(t.id)).map((t) => t.name),
			existing,
			values: input
		});
		if (written.changed && existing && input.sharedVersion !== null && input.sharedVersion !== existing.version) {
			return { message: CONFLICT };
		}
		if (written.changed && existing && !(await canEditShared(db, userId, existing))) {
			// Not theirs to change for everyone: the change stays in their timetable, still linked
			// (so overlays still group it), as 自分だけで使う. The form says so beforehand.
			syncMode = 'personal';
		} else {
			sharedCourseId = written.id;
			shared.push(...written.statements);
		}
	}

	const id = courseId ?? crypto.randomUUID();
	const values = {
		title: input.title,
		color: input.color,
		delivery: input.delivery,
		intensiveFrom: input.intensiveFrom,
		intensiveTo: input.intensiveTo,
		credits: input.credits,
		absenceLimit: input.absenceLimit,
		syncMode,
		sharedCourseId
	};
	const rest: BatchItem<'sqlite'>[] = [];
	if (courseId) {
		rest.push(
			db.delete(courseTerms).where(eq(courseTerms.courseId, id)),
			db.delete(courseSlots).where(eq(courseSlots.courseId, id)),
			db.delete(courseTeachers).where(eq(courseTeachers.courseId, id))
		);
	}
	rest.push(db.insert(courseTerms).values(input.termIds.map((termId) => ({ courseId: id, termId }))));
	if (input.slots.length) {
		rest.push(
			db.insert(courseSlots).values(
				input.slots.map((s) => ({
					courseId: id,
					weekday: s.weekday,
					periodNumber: s.period,
					span: s.span,
					weekPattern: s.week,
					room: s.room
				}))
			)
		);
	}
	if (input.teachers.length) {
		rest.push(
			db
				.insert(courseTeachers)
				.values(input.teachers.map((name, sortOrder) => ({ courseId: id, name, sortOrder })))
		);
	}
	return {
		id,
		existing,
		statements: [
			courseId
				? db.update(courses).set(values).where(eq(courses.id, id))
				: db.insert(courses).values({ id, timetableId: timetable.id, ...values }),
			...shared,
			...rest
		]
	};
}

/**
 * Writes prepared courses in one batch, after any `first` statements: all of it is saved or
 * none. A message comes back when a shared course changed after it was read.
 */
export async function commitCourses(db: Db, prepared: PreparedCourse[], first: BatchItem<'sqlite'>[] = []) {
	const [head, ...tail] = [...first, ...prepared.flatMap((p) => p.statements)];
	try {
		await db.batch([head, ...tail]);
	} catch (e) {
		// Someone saved a shared course between reading it and writing (the batch was rolled back).
		for (const { existing } of prepared) {
			const now = existing && (await loadSharedCourse(db, existing.id));
			if (now && now.version !== existing.version) return { message: CONFLICT };
		}
		throw e;
	}
	return null;
}

/** Every other course's slots in the timetable, with their terms: what a new length must not run into */
export async function otherSlots(db: Db, timetableId: string, exceptCourseId: string | null) {
	const [slots, terms] = await db.batch([
		db
			.select({
				courseId: courseSlots.courseId,
				weekday: courseSlots.weekday,
				period: courseSlots.periodNumber,
				span: courseSlots.span,
				week: courseSlots.weekPattern
			})
			.from(courseSlots)
			.innerJoin(courses, eq(courses.id, courseSlots.courseId))
			.where(eq(courses.timetableId, timetableId)),
		db
			.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
			.from(courseTerms)
			.innerJoin(courses, eq(courses.id, courseTerms.courseId))
			.where(eq(courses.timetableId, timetableId))
	]);
	return slots
		.filter((s) => s.courseId !== exceptCourseId)
		.map(({ courseId, ...s }) => ({ ...s, termIds: terms.filter((t) => t.courseId === courseId).map((t) => t.termId) }));
}

// The course, only if it is in one of the user's timetables
export function findOwnedCourse(db: Db, userId: string, courseId: string) {
	return db
		.select({
			course: courses,
			timetable: { id: timetables.id, year: timetables.year, universityId: timetables.universityId }
		})
		.from(courses)
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.where(and(eq(courses.id, courseId), eq(timetables.userId, userId)))
		.get();
}

export async function loadCourse(db: Db, userId: string, courseId: string) {
	// All in one trip to D1: the rest is read by the course id alone and only used once the
	// first two queries show the course is in the user's timetable. (Each reads one table:
	// in a batch, drizzle mixes up columns of the same name from a join.)
	const ofCourse = (column: typeof courses.timetableId | typeof courses.sharedCourseId) =>
		db.select({ id: column }).from(courses).where(eq(courses.id, courseId));
	const [[course], [timetable], termRows, periodRows, sharedRows, sharedSlots, sharedTeachers, notes, termLinks, slotRows, teacherRows, absences] =
		await db.batch([
			db.select().from(courses).where(eq(courses.id, courseId)),
			db
				.select({ id: timetables.id, year: timetables.year, universityId: timetables.universityId })
				.from(timetables)
				.where(and(eq(timetables.id, ofCourse(courses.timetableId)), eq(timetables.userId, userId))),
			...shapeQueries(db, ofCourse(courses.timetableId)),
			...sharedCourseQueries(db, ofCourse(courses.sharedCourseId)),
			loadNotes(db, courseId),
			db.select({ termId: courseTerms.termId }).from(courseTerms).where(eq(courseTerms.courseId, courseId)),
			db
				.select({
					weekday: courseSlots.weekday,
					period: courseSlots.periodNumber,
					span: courseSlots.span,
					week: courseSlots.weekPattern,
					room: courseSlots.room
				})
				.from(courseSlots)
				.where(eq(courseSlots.courseId, courseId))
				.orderBy(asc(courseSlots.weekday), asc(courseSlots.periodNumber)),
			db
				.select({ name: courseTeachers.name })
				.from(courseTeachers)
				.where(eq(courseTeachers.courseId, courseId))
				.orderBy(asc(courseTeachers.sortOrder)),
			db
				.select({ id: courseAbsences.id, date: courseAbsences.date })
				.from(courseAbsences)
				.where(eq(courseAbsences.courseId, courseId))
				.orderBy(desc(courseAbsences.date))
		]);
	if (!course || !timetable) return null;
	const shape = { terms: termRows, periods: periodRows };
	const shared = sharedCoursesFrom(sharedRows, sharedSlots, sharedTeachers).get(course.sharedCourseId ?? '') ?? null;
	const local = {
		title: course.title,
		teachers: teacherRows.map((t) => t.name),
		slots: slotRows,
		delivery: course.delivery,
		intensiveFrom: course.intensiveFrom,
		intensiveTo: course.intensiveTo,
		credits: course.credits
	};
	const values = course.syncMode === 'synced' && shared ? shared.values : local;
	return {
		timetable,
		...shape,
		course: {
			id: course.id,
			...values,
			color: course.color,
			absenceLimit: course.absenceLimit,
			termIds: termLinks.map((l) => l.termId),
			syncMode: course.syncMode
		},
		absences,
		shared: shared && { id: shared.id, source: shared.source, version: shared.version, values: shared.values },
		notes
	};
}

export async function deleteCourse(env: Env, db: Db, userId: string, courseId: string) {
	if (!(await findOwnedCourse(db, userId, courseId))) return false;
	await deleteCourseFiles(env, db, courseId);
	await db.delete(courses).where(eq(courses.id, courseId));
	return true;
}
