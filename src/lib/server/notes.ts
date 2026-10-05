import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { STEPS_MAX, STEP_TEXT_MAX, SUBMIT_TO_MAX, weeklyDates, type TaskStep } from '$lib/tasks';
import { isDate } from '$lib/time';
import type { Db } from './db';
import { courseNotes, courses } from './db/schema';

const MEMO_MAX = 1000;
const TASK_MAX = 100;
const CANCEL_NOTE_MAX = 100;

type NoteInput =
	| { kind: 'memo'; date: string; body: string }
	| { kind: 'task'; body: string; due: string | null; dueTime: string | null; submitTo: string | null; steps: TaskStep[] | null }
	| { kind: 'cancel'; date: string; body: string };

const length = (s: string) => [...s].length;
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// The steps as the form sends them: their texts, and whether each is done ('1') in the same order
function readSteps(form: FormData): TaskStep[] | { message: string } {
	const done = form.getAll('stepDone').map(String);
	const steps = form
		.getAll('step')
		.map((text, i) => ({ text: String(text).trim(), done: done[i] === '1' }))
		.filter((s) => s.text);
	if (steps.length > STEPS_MAX) return { message: `チェック項目は${STEPS_MAX}個までです` };
	if (steps.some((s) => length(s.text) > STEP_TEXT_MAX)) return { message: `チェック項目は1つ${STEP_TEXT_MAX}文字までです` };
	return steps;
}

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
		const dueTime = String(form.get('dueTime') ?? '') || null;
		if (dueTime && !isTime(dueTime)) return { message: '締切の時刻を確かめてください' };
		if (dueTime && !due) return { message: '締切の時刻を入れるときは、日付も入れてください' };
		const submitTo = String(form.get('submitTo') ?? '').trim() || null;
		if (submitTo && length(submitTo) > SUBMIT_TO_MAX) return { message: `提出先は${SUBMIT_TO_MAX}文字までです` };
		const steps = readSteps(form);
		if ('message' in steps) return steps;
		return { note: { kind, body, due, dueTime, submitTo, steps: steps.length ? steps : null } };
	}
	if (kind === 'cancel') {
		if (!isDate(date)) return { message: '休講の日を入れてください' };
		if (length(body) > CANCEL_NOTE_MAX) return { message: `メモは${CANCEL_NOTE_MAX}文字までです` };
		return { note: { kind, date, body } };
	}
	return { message: '追加するものを選んでください' };
}

/**
 * The last due date of a weekly homework, when the form asks for one ('repeat' on). Null when
 * it doesn't; a message when it can't be.
 */
export function parseRepeat(form: FormData, note: NoteInput): { until: string | null } | { message: string } {
	if (form.get('repeat') !== 'on' || note.kind !== 'task') return { until: null };
	const until = String(form.get('until') ?? '');
	if (!note.due) return { message: 'くり返すときは、締切の日付を入れてください' };
	if (!isDate(until) || until < note.due) return { message: 'くり返す最後の日を確かめてください' };
	return { until };
}

/** A weekly homework: one copy a week from its due date to `until`, linked by one series id */
export async function addWeeklyTask(db: Db, courseId: string, note: Extract<NoteInput, { kind: 'task' }>, until: string) {
	const seriesId = crypto.randomUUID();
	const steps = note.steps?.map((s) => ({ ...s, done: false })) ?? null;
	const rows = weeklyDates(note.due ?? until, until).map((due) => ({ courseId, ...note, due, steps, seriesId }));
	// D1 takes at most 100 bound values per query
	const inserts: BatchItem<'sqlite'>[] = [];
	for (let i = 0; i < rows.length; i += 5) inserts.push(db.insert(courseNotes).values(rows.slice(i, i + 5)));
	// One batch, so a series is added whole or not at all
	if (inserts.length) await db.batch(inserts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
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
	// A weekly homework whose due date is taken away leaves its series: without a date it
	// has no place in it, and 「これ以降ぜんぶ」 couldn't tell what comes after it.
	const leaves = note.kind === 'task' && !note.due ? { seriesId: null } : {};
	await db
		.update(courseNotes)
		.set({ ...fields, ...leaves })
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
			dueTime: courseNotes.dueTime,
			submitTo: courseNotes.submitTo,
			steps: courseNotes.steps,
			seriesId: courseNotes.seriesId,
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

// Both only touch notes of the given course, which the caller has checked is the user's.
export async function setTaskDone(db: Db, courseId: string, noteId: string, done: boolean) {
	await db
		.update(courseNotes)
		.set({ done })
		.where(and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId), eq(courseNotes.kind, 'task')));
}

// Checks off (or not) one step of a homework, by its place in the list. Only that step is
// written, so two quick checks don't undo each other.
export async function setStepDone(db: Db, courseId: string, noteId: string, index: number, done: boolean) {
	if (!Number.isInteger(index) || index < 0 || index >= STEPS_MAX) return;
	const path = `$[${index}].done`;
	await db
		.update(courseNotes)
		.set({ steps: sql`json_set(${courseNotes.steps}, ${path}, json(${done ? 'true' : 'false'}))` })
		.where(
			and(
				eq(courseNotes.id, noteId),
				eq(courseNotes.courseId, courseId),
				eq(courseNotes.kind, 'task'),
				sql`${index} < json_array_length(${courseNotes.steps})`
			)
		);
}

// `later`: a weekly homework's copies from this one on go too
export async function deleteNote(db: Db, courseId: string, noteId: string, later = false) {
	const own = and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId));
	if (later) {
		const note = await db.select({ seriesId: courseNotes.seriesId, due: courseNotes.due }).from(courseNotes).where(own).get();
		if (note?.seriesId && note.due) {
			await db
				.delete(courseNotes)
				.where(
					and(
						eq(courseNotes.courseId, courseId),
						eq(courseNotes.seriesId, note.seriesId),
						isNotNull(courseNotes.due),
						gte(courseNotes.due, note.due)
					)
				);
			return;
		}
	}
	await db.delete(courseNotes).where(own);
}
