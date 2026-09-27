import { and, asc, count, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { COURSE_COLORS, isCourseColor, type Delivery } from '$lib/courses';
import { isDate } from '$lib/time';
import type { Db } from './db';
import { courseSlots, courseTeachers, courseTerms, courses, timetables } from './db/schema';
import { loadShape, titleParts } from './timetable';

const TITLE_MAX = 60;
const TEACHER_MAX = 30;
const TEACHERS_MAX = 10;
const ROOM_MAX = 20;
const SLOTS_MAX = 14;

export type SlotInput = { weekday: number; period: number; span: number; room: string | null };

export type CourseInput = {
	title: string;
	teachers: string[];
	color: string;
	termIds: string[];
	slots: SlotInput[]; // empty for on-demand and intensive courses
	delivery: Delivery | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
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

	if (form.get('unscheduled') === 'on') {
		const delivery = form.get('delivery') === 'intensive' ? 'intensive' : 'ondemand';
		const from = delivery === 'intensive' ? String(form.get('intensive_from') ?? '') || null : null;
		const to = delivery === 'intensive' ? String(form.get('intensive_to') ?? '') || null : null;
		if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && to < from)) {
			return { message: '集中講義の期間を確かめてください' };
		}
		return {
			input: { title, teachers, color, termIds, slots: [], delivery, intensiveFrom: from, intensiveTo: to }
		};
	}

	const slots = parseSlots(form.getAll('slot'), shape.periods);
	if (typeof slots === 'string') return { message: slots };
	if (!slots.length) {
		return { message: '曜日・時限を1つ以上入れるか、「曜日・時限がない」にチェックしてください' };
	}
	return {
		input: { title, teachers, color, termIds, slots, delivery: null, intensiveFrom: null, intensiveTo: null }
	};
}

// Slots arrive as JSON, one per field. They must fit in the timetable and not overlap.
function parseSlots(values: FormDataEntryValue[], periods: number[]): SlotInput[] | string {
	const invalid = '曜日・時限を確かめてください';
	if (values.length > SLOTS_MAX) return `曜日・時限は${SLOTS_MAX}個までです`;
	const slots: (SlotInput & { start: number })[] = [];
	for (const value of values) {
		let raw: { weekday?: unknown; period?: unknown; span?: unknown; room?: unknown };
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
		const overlaps = slots.some(
			(s) => s.weekday === weekday && s.start <= start + span - 1 && start <= s.start + s.span - 1
		);
		if (overlaps) return '同じ曜日で時限が重なっています';
		slots.push({ weekday, period: period as number, span, room: room || null, start });
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

export async function saveCourse(db: Db, timetableId: string, courseId: string | null, input: CourseInput) {
	const id = courseId ?? crypto.randomUUID();
	const values = {
		title: input.title,
		color: input.color,
		delivery: input.delivery,
		intensiveFrom: input.intensiveFrom,
		intensiveTo: input.intensiveTo
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
	await db.batch([
		courseId
			? db.update(courses).set(values).where(eq(courses.id, id))
			: db.insert(courses).values({ id, timetableId, ...values }),
		...rest
	]);
	return id;
}

// The course, only if it is in one of the user's timetables
function findOwnedCourse(db: Db, userId: string, courseId: string) {
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
	const row = await findOwnedCourse(db, userId, courseId);
	if (!row) return null;
	const [shape, [termLinks, slotRows, teacherRows]] = await Promise.all([
		loadShape(db, row.timetable.id),
		db.batch([
			db.select({ termId: courseTerms.termId }).from(courseTerms).where(eq(courseTerms.courseId, courseId)),
			db
				.select({
					weekday: courseSlots.weekday,
					period: courseSlots.periodNumber,
					span: courseSlots.span,
					room: courseSlots.room
				})
				.from(courseSlots)
				.where(eq(courseSlots.courseId, courseId))
				.orderBy(asc(courseSlots.weekday), asc(courseSlots.periodNumber)),
			db
				.select({ name: courseTeachers.name })
				.from(courseTeachers)
				.where(eq(courseTeachers.courseId, courseId))
				.orderBy(asc(courseTeachers.sortOrder))
		])
	]);
	const { course } = row;
	return {
		timetable: row.timetable,
		...shape,
		course: {
			id: course.id,
			title: course.title,
			titleParts: titleParts(course.title),
			color: course.color,
			teachers: teacherRows.map((t) => t.name),
			termIds: termLinks.map((l) => l.termId),
			slots: slotRows,
			delivery: course.delivery,
			intensiveFrom: course.intensiveFrom,
			intensiveTo: course.intensiveTo
		}
	};
}

export async function deleteCourse(db: Db, userId: string, courseId: string) {
	if (!(await findOwnedCourse(db, userId, courseId))) return false;
	await db.delete(courses).where(eq(courses.id, courseId));
	return true;
}
