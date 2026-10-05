import { and, asc, count, eq, gte, or } from 'drizzle-orm';
import { CALENDAR_MAX, MOVES_MAX, type CalendarDay } from '$lib/calendar';
import { isDate } from '$lib/time';
import type { Db } from './db';
import { calendarEntries, courseMoves, courses, universities } from './db/schema';

const calendarColumns = {
	id: calendarEntries.id,
	kind: calendarEntries.kind,
	label: calendarEntries.label,
	start: calendarEntries.start,
	end: calendarEntries.end
};

// A timetable's days off and exam periods; with `since`, only those not over by then
export function calendarQuery(db: Db, timetableId: string, since?: string) {
	return db
		.select(calendarColumns)
		.from(calendarEntries)
		.where(and(eq(calendarEntries.timetableId, timetableId), since ? gte(calendarEntries.end, since) : undefined))
		.orderBy(asc(calendarEntries.start), asc(calendarEntries.end));
}

const moveColumns = {
	id: courseMoves.id,
	courseId: courseMoves.courseId,
	fromDate: courseMoves.fromDate,
	toDate: courseMoves.toDate,
	period: courseMoves.period,
	span: courseMoves.span,
	room: courseMoves.room
};

// The moved classes of a timetable that still matter from `today`
export function upcomingMoves(db: Db, timetableId: string, today: string) {
	return db
		.select(moveColumns)
		.from(courseMoves)
		.innerJoin(courses, eq(courseMoves.courseId, courses.id))
		.where(and(eq(courses.timetableId, timetableId), or(gte(courseMoves.toDate, today), gte(courseMoves.fromDate, today))));
}

export function courseMovesQuery(db: Db, courseId: string) {
	return db.select(moveColumns).from(courseMoves).where(eq(courseMoves.courseId, courseId)).orderBy(asc(courseMoves.fromDate));
}

/** Adds the entries not already there (same kind and days). Returns how many, or null when it would be too many. */
export async function addCalendarEntries(db: Db, timetableId: string, entries: CalendarDay[]) {
	const have = await calendarQuery(db, timetableId);
	const key = (e: CalendarDay) => `${e.kind}|${e.start}|${e.end}`;
	const known = new Set(have.map(key));
	const fresh = entries.filter((e) => !known.has(key(e)) && !!known.add(key(e)));
	if (!fresh.length) return 0;
	if (have.length + fresh.length > CALENDAR_MAX) return null;
	// D1 takes at most 100 bound values per query: 6 a row
	for (let i = 0; i < fresh.length; i += 15) {
		await db.insert(calendarEntries).values(
			fresh.slice(i, i + 15).map(({ kind, label, start, end }) => ({ timetableId, kind, label, start, end }))
		);
	}
	return fresh.length;
}

export async function deleteCalendarEntry(db: Db, timetableId: string, id: string) {
	await db.delete(calendarEntries).where(and(eq(calendarEntries.id, id), eq(calendarEntries.timetableId, timetableId)));
}

/** The university's calendar for the year, when it has one */
export async function calendarPreset(db: Db, universityId: string | null, year: number) {
	if (!universityId) return null;
	const row = await db
		.select({ name: universities.name, preset: universities.calendarPreset })
		.from(universities)
		.where(eq(universities.id, universityId))
		.get();
	const preset = row?.preset;
	if (!preset || preset.year !== year || !Array.isArray(preset.entries)) return null;
	const entries = preset.entries.filter(
		(e) => (e.kind === 'off' || e.kind === 'exam') && isDate(e.start) && isDate(e.end) && e.start <= e.end && typeof e.label === 'string'
	);
	const source = typeof preset.source === 'string' && /^https:\/\//.test(preset.source) ? preset.source : null;
	return { name: row.name, source, checkedAt: String(preset.checkedAt ?? ''), entries };
}

export type MoveInput = { fromDate: string; toDate: string; period: number; span: number; room: string | null };

const ROOM_MAX = 50;

export function parseMove(form: FormData, periods: number[]): { move: MoveInput } | { message: string } {
	const fromDate = String(form.get('from') ?? '');
	const toDate = String(form.get('to') ?? '');
	const period = Number(form.get('period'));
	const span = Number(form.get('span') ?? 1);
	const room = String(form.get('room') ?? '').trim() || null;
	if (!isDate(fromDate)) return { message: 'もとの日を確かめてください' };
	if (!isDate(toDate)) return { message: '振替の日を確かめてください' };
	if (!periods.includes(period)) return { message: '時限を選んでください' };
	if (!Number.isInteger(span) || span < 1 || !periods.includes(period + span - 1)) return { message: 'コマ数を確かめてください' };
	if (room && [...room].length > ROOM_MAX) return { message: `教室は${ROOM_MAX}文字までです` };
	return { move: { fromDate, toDate, period, span, room } };
}

/** False when the course already has too many */
export async function addMove(db: Db, courseId: string, move: MoveInput) {
	const [row] = await db.select({ n: count() }).from(courseMoves).where(eq(courseMoves.courseId, courseId));
	if ((row?.n ?? 0) >= MOVES_MAX) return false;
	await db.insert(courseMoves).values({ courseId, ...move });
	return true;
}

export async function deleteMove(db: Db, courseId: string, id: string) {
	await db.delete(courseMoves).where(and(eq(courseMoves.id, id), eq(courseMoves.courseId, courseId)));
}
