import { and, asc, eq, gte } from 'drizzle-orm';
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
	await db.insert(courseNotes).values({ courseId, ...note });
}

export function loadNotes(db: Db, courseId: string) {
	return db
		.select({
			id: courseNotes.id,
			kind: courseNotes.kind,
			date: courseNotes.date,
			body: courseNotes.body,
			due: courseNotes.due,
			done: courseNotes.done
		})
		.from(courseNotes)
		.where(eq(courseNotes.courseId, courseId))
		.orderBy(asc(courseNotes.createdAt));
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

// Both only touch notes of the given course, which the caller has checked is the user's.
export async function setTaskDone(db: Db, courseId: string, noteId: string, done: boolean) {
	await db
		.update(courseNotes)
		.set({ done })
		.where(and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId), eq(courseNotes.kind, 'task')));
}

export async function deleteNote(db: Db, courseId: string, noteId: string) {
	await db.delete(courseNotes).where(and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId)));
}
