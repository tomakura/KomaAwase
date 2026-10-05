import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { isDate } from '$lib/time';
import type { Db } from './db';
import { courseNotes, courses } from './db/schema';

const MEMO_MAX = 1000;
const TASK_MAX = 100;
const CANCEL_NOTE_MAX = 100;

type NoteInput =
	| { kind: 'memo'; date: string; body: string }
	| { kind: 'task'; body: string; due: string | null }
	| { kind: 'cancel'; date: string; body: string };

const length = (s: string) => [...s].length;

export function parseNote(form: FormData): { note: NoteInput } | { message: string } {
	const kind = form.get('kind');
	const body = String(form.get('body') ?? '').trim();
	const date = String(form.get('date') ?? '');
	if (kind === 'memo') {
		if (!body || length(body) > MEMO_MAX) return { message: `メモは1〜${MEMO_MAX}文字で入れてください` };
		if (!isDate(date)) return { message: '日付を確かめてください' };
		return { note: { kind, date, body } };
	}
	if (kind === 'task') {
		if (!body || length(body) > TASK_MAX) return { message: `課題の名前は1〜${TASK_MAX}文字で入れてください` };
		const due = String(form.get('due') ?? '') || null;
		if (due && !isDate(due)) return { message: '締切の日付を確かめてください' };
		return { note: { kind, body, due } };
	}
	if (kind === 'cancel') {
		if (!isDate(date)) return { message: '休講の日を入れてください' };
		if (length(body) > CANCEL_NOTE_MAX) return { message: `メモは${CANCEL_NOTE_MAX}文字までです` };
		return { note: { kind, date, body } };
	}
	return { message: '追加するものを選んでください' };
}

export async function addNote(db: Db, courseId: string, note: NoteInput) {
	// After the memos were put in an order by hand, a new one goes above all of them
	const top =
		note.kind === 'memo'
			? sql<number | null>`(select min(sort_order) - 1 from course_notes where course_id = ${courseId} and kind = 'memo')`
			: null;
	await db.insert(courseNotes).values({ courseId, ...note, sortOrder: top });
}

// Changes what was written; the kind, the day it was added and the place in the order stay.
export async function updateNote(db: Db, courseId: string, noteId: string, note: NoteInput) {
	const { kind, ...fields } = note;
	await db
		.update(courseNotes)
		.set(fields)
		.where(and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId), eq(courseNotes.kind, kind)));
}

// The memos in the order given, top first. Ids that aren't this course's memos are ignored.
export async function orderMemoIds(db: Db, courseId: string, ids: string[]) {
	const own = await db
		.select({ id: courseNotes.id })
		.from(courseNotes)
		.where(and(eq(courseNotes.courseId, courseId), eq(courseNotes.kind, 'memo'), inArray(courseNotes.id, ids)));
	const mine = new Set(own.map((n) => n.id));
	const wanted = ids.filter((id, i) => mine.has(id) && ids.indexOf(id) === i);
	if (!wanted.length) return;
	const statements: BatchItem<'sqlite'>[] = wanted.map((id, place) =>
		db
			.update(courseNotes)
			.set({ sortOrder: place })
			.where(and(eq(courseNotes.id, id), eq(courseNotes.courseId, courseId)))
	);
	await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

export function loadNotes(db: Db, courseId: string) {
	return db
		.select({
			id: courseNotes.id,
			kind: courseNotes.kind,
			date: courseNotes.date,
			body: courseNotes.body,
			due: courseNotes.due,
			done: courseNotes.done,
			sortOrder: courseNotes.sortOrder
		})
		.from(courseNotes)
		.where(eq(courseNotes.courseId, courseId))
		// In the order they were added (orderMemos in src/lib/notes.ts relies on it)
		.orderBy(asc(courseNotes.createdAt), sql`rowid`);
}

// Cancellations from `today` on in a timetable, for its 休講 labels
export function upcomingCancellations(db: Db, timetableId: string, today: string) {
	return db
		.select({ courseId: courseNotes.courseId, date: courseNotes.date })
		.from(courseNotes)
		.innerJoin(courses, eq(courseNotes.courseId, courses.id))
		.where(
			and(eq(courses.timetableId, timetableId), eq(courseNotes.kind, 'cancel'), gte(courseNotes.date, today))
		);
}

// Only touches notes of the given course, which the caller has checked is the user's.
export async function setTaskDone(db: Db, courseId: string, noteId: string, done: boolean) {
	await db
		.update(courseNotes)
		.set({ done })
		.where(and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId), eq(courseNotes.kind, 'task')));
}

