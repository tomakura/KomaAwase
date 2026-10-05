import { and, asc, eq, gte, or, sql } from 'drizzle-orm';
import type { Plan } from '$lib/plans';
import { stepsDone } from '$lib/tasks';
import { addDays, academicYear, isDate } from '$lib/time';
import type { Db } from './db';
import { courseNotes, courses, events, timetables } from './db/schema';
import { shownTitle } from './shared-courses';

const TITLE_MAX = 100;
const PLACE_MAX = 50;
const MEMO_MAX = 500;
const EXAM_TEXT_MAX = 500;
// How far back finished things are still listed
const KEEP_DAYS = 60;

const length = (s: string) => [...s].length;
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export type EventInput = {
	title: string;
	date: string;
	startTime: string | null;
	endTime: string | null;
	place: string | null;
	memo: string | null;
	courseId: string | null;
	exam: boolean;
	scope: string | null;
	bring: string | null;
};

export function parseEvent(form: FormData): { event: EventInput } | { message: string } {
	const title = String(form.get('title') ?? '').trim();
	const date = String(form.get('date') ?? '');
	// An all-day event has no times, whatever was left in the fields
	const allDay = form.get('allDay') === 'on';
	const startTime = (!allDay && String(form.get('start') ?? '')) || null;
	const endTime = (!allDay && String(form.get('end') ?? '')) || null;
	const place = String(form.get('place') ?? '').trim() || null;
	const memo = String(form.get('memo') ?? '').trim() || null;
	const courseId = String(form.get('courseId') ?? '') || null;
	const exam = form.get('exam') === 'on';
	const scope = (exam && String(form.get('scope') ?? '').trim()) || null;
	const bring = (exam && String(form.get('bring') ?? '').trim()) || null;
	if (!title || length(title) > TITLE_MAX) return { message: `名前は1〜${TITLE_MAX}文字で入れてください` };
	if (!isDate(date)) return { message: '日付を確かめてください' };
	if ((startTime && !isTime(startTime)) || (endTime && !isTime(endTime))) return { message: '時刻を確かめてください' };
	if (endTime && !startTime) return { message: '終わりの時刻を入れるときは、はじまりの時刻も入れてください' };
	if (startTime && endTime && endTime < startTime) return { message: '終わりの時刻は、はじまりより後にしてください' };
	if (place && length(place) > PLACE_MAX) return { message: `場所は${PLACE_MAX}文字までです` };
	if (memo && length(memo) > MEMO_MAX) return { message: `メモは${MEMO_MAX}文字までです` };
	if (scope && length(scope) > EXAM_TEXT_MAX) return { message: `範囲は${EXAM_TEXT_MAX}文字までです` };
	if (bring && length(bring) > EXAM_TEXT_MAX) return { message: `持ち物は${EXAM_TEXT_MAX}文字までです` };
	return { event: { title, date, startTime, endTime, place, memo, courseId, exam, scope, bring } };
}

// The classes of this year's timetable, for choosing which one a homework or event belongs to
export function listCourseChoices(db: Db, userId: string, today: string) {
	return db
		.select({ id: courses.id, title: shownTitle })
		.from(courses)
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.where(and(eq(timetables.userId, userId), eq(timetables.year, academicYear(today))))
		.orderBy(shownTitle)
		.all();
}

export async function loadPlans(db: Db, userId: string, today: string): Promise<Plan[]> {
	const since = addDays(today, -KEEP_DAYS);
	const [tasks, eventRows] = await Promise.all([
		db
			.select({
				id: courseNotes.id,
				title: courseNotes.body,
				date: courseNotes.due,
				start: courseNotes.dueTime,
				steps: courseNotes.steps,
				done: courseNotes.done,
				courseId: courses.id,
				course: shownTitle
			})
			.from(courseNotes)
			.innerJoin(courses, eq(courseNotes.courseId, courses.id))
			.innerJoin(timetables, eq(courses.timetableId, timetables.id))
			.where(
				and(
					eq(timetables.userId, userId),
					eq(timetables.archived, false),
					eq(courseNotes.kind, 'task'),
					// Homework with no date, or not long past
					or(eq(courseNotes.done, false), gte(courseNotes.due, since))
				)
			)
			// What is kept when there are more: not done first, the nearest due date first
			.orderBy(asc(courseNotes.done), sql`${courseNotes.due} is null`, asc(courseNotes.due))
			.limit(500)
			.all(),
		db
			.select({
				id: events.id,
				title: events.title,
				date: events.date,
				start: events.startTime,
				end: events.endTime,
				place: events.place,
				memo: events.memo,
				exam: events.exam,
				scope: events.scope,
				bring: events.bring,
				courseId: events.courseId,
				course: sql<string | null>`${shownTitle}`
			})
			.from(events)
			.leftJoin(courses, eq(events.courseId, courses.id))
			.where(and(eq(events.userId, userId), gte(events.date, since)))
			// What is kept when there are more: from today on first, the nearest first
			.orderBy(sql`${events.date} < ${today}`, asc(events.date))
			.limit(500)
			.all()
	]);
	return [
		...tasks.map(
			({ steps, ...t }): Plan => ({
				kind: 'task',
				...t,
				end: null,
				place: null,
				memo: null,
				steps: stepsDone(steps),
				exam: false,
				scope: null,
				bring: null
			})
		),
		...eventRows.map((e): Plan => ({ kind: 'event', ...e, steps: null, done: false }))
	];
}

// The events attached to one class, for its detail sheet (the caller has checked the class is the user's)
export function listCourseEvents(db: Db, courseId: string) {
	return db
		.select({
			id: events.id,
			title: events.title,
			date: events.date,
			start: events.startTime,
			end: events.endTime,
			place: events.place,
			memo: events.memo,
			exam: events.exam,
			scope: events.scope,
			bring: events.bring
		})
		.from(events)
		.where(eq(events.courseId, courseId))
		.orderBy(events.date, events.startTime)
		.limit(200)
		.all();
}

/** Only a course of this person's can be attached */
async function ownCourseId(db: Db, userId: string, courseId: string | null) {
	if (!courseId) return null;
	const row = await db
		.select({ id: courses.id })
		.from(courses)
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.where(and(eq(courses.id, courseId), eq(timetables.userId, userId)))
		.get();
	return row?.id ?? null;
}

export async function addEvent(db: Db, userId: string, input: EventInput) {
	const courseId = await ownCourseId(db, userId, input.courseId);
	await db.insert(events).values({ userId, ...input, courseId });
}

export async function updateEvent(db: Db, userId: string, eventId: string, input: EventInput) {
	const courseId = await ownCourseId(db, userId, input.courseId);
	await db
		.update(events)
		.set({ ...input, courseId })
		.where(and(eq(events.id, eventId), eq(events.userId, userId)));
}

