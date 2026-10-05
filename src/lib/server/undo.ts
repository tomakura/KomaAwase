import { and, eq, gt, lt } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from './db';
import { courseNotes, courses, events, timetables, undoItems } from './db/schema';

// How long after deleting 元に戻す still works (the screen offers it for a few seconds)
const KEEP_MS = 10 * 60 * 1000;

type Kind = 'note' | 'event';

// The row as it was read, with its times back as dates (it went through JSON)
function revive(row: Record<string, unknown>) {
	const out: Record<string, unknown> = { ...row };
	for (const [k, v] of Object.entries(out)) if (k.endsWith('At') && typeof v === 'string') out[k] = new Date(v);
	return out;
}

/** Deletes a row after keeping it for 元に戻す. Returns the key to undo with, or null if there was no such row. */
async function removeKept(db: Db, userId: string, kind: Kind, row: Record<string, unknown> | undefined, remove: BatchItem<'sqlite'>) {
	if (!row) return null;
	const id = crypto.randomUUID();
	const now = Date.now();
	await db.batch([
		db.delete(undoItems).where(and(eq(undoItems.userId, userId), lt(undoItems.expiresAt, new Date(now)))),
		db.insert(undoItems).values({ id, userId, kind, row, expiresAt: new Date(now + KEEP_MS) }),
		remove
	]);
	return id;
}

// Only notes of the given course, which the caller has checked is the user's
export async function deleteNoteKept(db: Db, userId: string, courseId: string, noteId: string) {
	const where = and(eq(courseNotes.id, noteId), eq(courseNotes.courseId, courseId));
	const row = await db.select().from(courseNotes).where(where).get();
	return removeKept(db, userId, 'note', row, db.delete(courseNotes).where(where));
}

export async function deleteEventKept(db: Db, userId: string, eventId: string) {
	const where = and(eq(events.id, eventId), eq(events.userId, userId));
	const row = await db.select().from(events).where(where).get();
	return removeKept(db, userId, 'event', row, db.delete(events).where(where));
}

const ownsCourse = async (db: Db, userId: string, courseId: unknown) =>
	typeof courseId === 'string' &&
	!!(await db
		.select({ id: courses.id })
		.from(courses)
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.where(and(eq(courses.id, courseId), eq(timetables.userId, userId)))
		.get());

/** Puts back what was deleted, as it was. False when it's too late or its course has gone. */
export async function undoDelete(db: Db, userId: string, id: string) {
	const item = await db
		.select()
		.from(undoItems)
		.where(and(eq(undoItems.id, id), eq(undoItems.userId, userId), gt(undoItems.expiresAt, new Date())))
		.get();
	if (!item) return false;
	const row = revive(item.row);
	const used = db.delete(undoItems).where(eq(undoItems.id, id));
	if (item.kind === 'note') {
		if (!(await ownsCourse(db, userId, row.courseId))) return false;
		await db.batch([db.insert(courseNotes).values(row as typeof courseNotes.$inferInsert).onConflictDoNothing(), used]);
	} else {
		// An event stays even if its class has gone since, as deleting the class leaves them
		if (row.courseId != null && !(await ownsCourse(db, userId, row.courseId))) row.courseId = null;
		await db.batch([db.insert(events).values({ ...(row as typeof events.$inferInsert), userId }).onConflictDoNothing(), used]);
	}
	return true;
}

/** For the daily sweep */
export function sweepUndo(db: Db) {
	return db.delete(undoItems).where(lt(undoItems.expiresAt, new Date()));
}
