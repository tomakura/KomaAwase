import { and, eq, gte, or } from 'drizzle-orm';
import type { Plan } from '$lib/plans';
import { addDays, academicYear, isDate } from '$lib/time';
import type { Db } from './db';
import { courseNotes, courses, events, timetables } from './db/schema';

const TITLE_MAX = 100;
const PLACE_MAX = 50;
const MEMO_MAX = 500;
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
	if (!title || length(title) > TITLE_MAX) return { message: `名前は1〜${TITLE_MAX}文字で入れてください` };
	if (!isDate(date)) return { message: '日付を確かめてください' };
	if ((startTime && !isTime(startTime)) || (endTime && !isTime(endTime))) return { message: '時刻を確かめてください' };
	if (endTime && !startTime) return { message: '終わりの時刻を入れるときは、はじまりの時刻も入れてください' };
	if (startTime && endTime && endTime < startTime) return { message: '終わりの時刻は、はじまりより後にしてください' };
	if (place && length(place) > PLACE_MAX) return { message: `場所は${PLACE_MAX}文字までです` };
	if (memo && length(memo) > MEMO_MAX) return { message: `メモは${MEMO_MAX}文字までです` };
	return { event: { title, date, startTime, endTime, place, memo, courseId } };
}

// The classes of this year's timetable, for choosing which one a homework or event belongs to
export function listCourseChoices(db: Db, userId: string, today: string) {
	return db
		.select({ id: courses.id, title: courses.title })
		.from(courses)
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.where(and(eq(timetables.userId, userId), eq(timetables.year, academicYear(today))))
		.orderBy(courses.title)
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
				done: courseNotes.done,
				courseId: courses.id,
				course: courses.title
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
				courseId: events.courseId,
				course: courses.title
			})
			.from(events)
			.leftJoin(courses, eq(events.courseId, courses.id))
			.where(and(eq(events.userId, userId), gte(events.date, since)))
			.limit(500)
			.all()
	]);
	return [
		...tasks.map((t): Plan => ({ kind: 'task', ...t, start: null, end: null, place: null, memo: null })),
		...eventRows.map((e): Plan => ({ kind: 'event', ...e, done: false }))
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
			memo: events.memo
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

export async function deleteEvent(db: Db, userId: string, eventId: string) {
	await db.delete(events).where(and(eq(events.id, eventId), eq(events.userId, userId)));
}
