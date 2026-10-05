import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, desc, eq, inArray, lt, sql, type SQLWrapper } from 'drizzle-orm';
import { MAYBE_MIN } from '$lib/cancellations';
import { DEFAULT_PERIODS, termTemplate, type PeriodInput, type TermInput } from '$lib/presets';
import { remapTerm } from '$lib/terms';
import { academicYear, isDate, tokyoTime } from '$lib/time';
import type { KnownTimetable } from './auth/session';
import type { Db } from './db';
import { courseSlots, courseTerms, courses, periods, terms, timetables } from './db/schema';
import { sharedCancellations } from './cancellations';
import { calendarQuery, upcomingMoves } from './calendar';
import { upcomingCancellations } from './notes';
import { sharedCourseQueries, sharedCoursesFrom } from './shared-courses';
import { getUniversity } from './universities';

export type Owner = { id: string; universityId: string | null };

function findTimetable(db: Db, userId: string, year: number) {
	return db
		.select({ id: timetables.id, year: timetables.year, universityId: timetables.universityId })
		.from(timetables)
		.where(and(eq(timetables.userId, userId), eq(timetables.year, year)))
		.get();
}

// 2026-04-01 a year on is 2027-04-01; 2/29 becomes 2/28.
function shiftYear(date: string | null, years: number) {
	if (!date) return null;
	const shifted = `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
	return isDate(shifted) ? shifted : `${shifted.slice(0, 8)}28`;
}

// Terms and periods for a new timetable: the university's preset, else the shape of the
// user's latest timetable a year on, else 2学期制 with six 90-minute periods.
export async function startingShape(db: Db, owner: Owner, year: number) {
	const university = owner.universityId ? await getUniversity(db, owner.universityId) : undefined;
	let termRows: TermInput[] | null = null;
	let periodRows: PeriodInput[] | null = null;

	if (university?.termPreset?.length) {
		termRows = university.termPreset.map((t) => {
			// Preset dates are for one year; an outdated preset still gives the term names.
			const dated = !!t.start && academicYear(t.start) === year;
			return {
				name: t.name,
				group: t.group ?? null,
				start: dated ? (t.start ?? null) : null,
				end: dated ? (t.end ?? null) : null
			};
		});
	}
	if (university?.periodPreset?.length) {
		periodRows = university.periodPreset.map((p) => ({ number: p.number, start: p.start, end: p.end }));
	}
	if (!termRows || !periodRows) {
		const previous = await db
			.select({ id: timetables.id, year: timetables.year })
			.from(timetables)
			.where(and(eq(timetables.userId, owner.id), lt(timetables.year, year)))
			.orderBy(desc(timetables.year))
			.get();
		if (previous) {
			const shape = await loadShape(db, previous.id);
			const years = year - previous.year;
			if (!termRows && shape.terms.length) {
				termRows = shape.terms.map((t) => ({
					name: t.name,
					group: t.groupName,
					start: shiftYear(t.startDate, years),
					end: shiftYear(t.endDate, years)
				}));
			}
			if (!periodRows && shape.periods.length) periodRows = shape.periods;
		}
	}
	return {
		universityId: university?.id ?? null,
		terms: termRows ?? termTemplate('semester', year),
		periods: periodRows ?? DEFAULT_PERIODS
	};
}

// Inserts of many rows are split to stay under D1's 100 bound values per query.
export function chunks<T>(rows: T[], size: number) {
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
	return out;
}

const termRow = (timetableId: string, t: TermInput, sortOrder: number) => ({
	timetableId,
	name: t.name,
	groupName: t.group,
	startDate: t.start,
	endDate: t.end,
	sortOrder
});

/**
 * Statements that make the timetable's terms `input`. Terms keep their id when `input`
 * names it; courses in a removed term move to the terms that replace it (see remapTerm).
 */
export async function termStatements(db: Db, timetableId: string, input: TermInput[]) {
	const existing = await db
		.select({ id: terms.id, start: terms.startDate, end: terms.endDate })
		.from(terms)
		.where(eq(terms.timetableId, timetableId))
		.orderBy(asc(terms.sortOrder));
	const existingIds = new Set(existing.map((t) => t.id));
	const next = input.map((t) => {
		const kept = !!t.id && existingIds.has(t.id);
		return { ...t, id: kept && t.id ? t.id : crypto.randomUUID(), kept };
	});
	const keptIds = new Set(next.filter((t) => t.kept).map((t) => t.id));
	const removed = existing.filter((t) => !keptIds.has(t.id));

	const statements: BatchItem<'sqlite'>[] = [];
	next.forEach((t, i) => {
		if (t.kept) statements.push(db.update(terms).set(termRow(timetableId, t, i)).where(eq(terms.id, t.id)));
	});
	const inserts = next.flatMap((t, i) => (t.kept ? [] : [{ id: t.id, ...termRow(timetableId, t, i) }]));
	if (inserts.length) statements.push(db.insert(terms).values(inserts));

	if (removed.length) {
		const removedIds = removed.map((t) => t.id);
		const links = await db
			.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
			.from(courseTerms)
			.where(inArray(courseTerms.termId, removedIds));
		const moved = new Map<string, { courseId: string; termId: string }>();
		for (const link of links) {
			const index = existing.findIndex((t) => t.id === link.termId);
			for (const j of remapTerm({ ...existing[index], index }, existing.length, next)) {
				const termId = next[j].id;
				moved.set(`${link.courseId} ${termId}`, { courseId: link.courseId, termId });
			}
		}
		for (const rows of chunks([...moved.values()], 40)) {
			statements.push(db.insert(courseTerms).values(rows).onConflictDoNothing());
		}
		statements.push(db.delete(terms).where(inArray(terms.id, removedIds)));
	}
	return statements;
}

// Slots keep their period numbers, so a period that comes back shows its courses again.
export function periodStatements(db: Db, timetableId: string, input: PeriodInput[]): BatchItem<'sqlite'>[] {
	return [
		db.delete(periods).where(eq(periods.timetableId, timetableId)),
		db
			.insert(periods)
			.values(input.map((p) => ({ timetableId, number: p.number, startTime: p.start, endTime: p.end })))
	];
}

/** Creates the timetable for `year` and marks the older ones as past. */
export async function createTimetable(
	db: Db,
	owner: Owner,
	year: number,
	shape: { universityId: string | null; terms: TermInput[]; periods: PeriodInput[] }
) {
	const timetableId = crypto.randomUUID();
	await db.batch([
		db.insert(timetables).values({
			id: timetableId,
			userId: owner.id,
			universityId: shape.universityId,
			year,
			name: `${year}年度`
		}),
		db.insert(terms).values(shape.terms.map((t, i) => termRow(timetableId, t, i))),
		db
			.insert(periods)
			.values(shape.periods.map((p) => ({ timetableId, number: p.number, startTime: p.start, endTime: p.end }))),
		db
			.update(timetables)
			.set({ archived: true })
			.where(and(eq(timetables.userId, owner.id), lt(timetables.year, year)))
	]);
	return { id: timetableId, year, universityId: shape.universityId };
}

// Returns the user's timetable for the year, making it the first time.
// `known` is the timetable read with the session (locals.timetable), used when it's for `year`.
export async function getOrCreateTimetable(db: Db, owner: Owner, year: number, known?: KnownTimetable | null) {
	if (known?.year === year) return known;
	const existing = await findTimetable(db, owner.id, year);
	if (existing) return existing;
	try {
		return await createTimetable(db, owner, year, await startingShape(db, owner, year));
	} catch (e) {
		// A parallel request (a link preload, say) created it first.
		const created = await findTimetable(db, owner.id, year);
		if (created) return created;
		throw e;
	}
}

// The timetable for this academic year
export function currentTimetable(db: Db, owner: Owner, known?: KnownTimetable | null) {
	return getOrCreateTimetable(db, owner, academicYear(tokyoTime(Date.now()).date), known);
}

const termsQuery = (db: Db, timetableId: string | SQLWrapper) =>
	db
		.select({
			id: terms.id,
			name: terms.name,
			groupName: terms.groupName,
			startDate: terms.startDate,
			endDate: terms.endDate
		})
		.from(terms)
		.where(eq(terms.timetableId, timetableId))
		.orderBy(asc(terms.sortOrder));

const periodsQuery = (db: Db, timetableId: string | SQLWrapper) =>
	db
		.select({ number: periods.number, start: periods.startTime, end: periods.endTime })
		.from(periods)
		.where(eq(periods.timetableId, timetableId))
		.orderBy(asc(periods.number));

// The queries behind loadShape, for a caller's own batch; the id can be a subquery.
export const shapeQueries = (db: Db, timetableId: string | SQLWrapper) =>
	[termsQuery(db, timetableId), periodsQuery(db, timetableId)] as const;

// Terms and periods, for forms that place a course in the timetable
export async function loadShape(db: Db, timetableId: string) {
	const [termRows, periodRows] = await db.batch(shapeQueries(db, timetableId));
	return { terms: termRows, periods: periodRows };
}


// `today` (YYYY-MM-DD) picks the cancellations still to come.
// `viewerId` adds `maybeCancels`: days other people syncing the class have marked as 休講.
/**
 * Whether the shared course of a synced course (in a query that reads `courses`) has been
 * changed by someone other than this user since they last saw it (courses.shared_seen_at)
 */
export const sharedChangedSql = (userId: string) => sql<number>`exists (select 1 from shared_course_edits e
	where "courses"."sync_mode" = 'synced' and e.shared_course_id = "courses"."shared_course_id"
	and e.created_at > coalesce("courses"."shared_seen_at", "courses"."created_at")
	and (e.user_id is null or e.user_id <> ${userId}))`;

export async function loadTimetable(db: Db, timetableId: string, today: string, viewerId?: string) {
	// Synced courses show the shared title, slots and rooms, read in the same batch.
	const syncedIds = db
		.select({ id: courses.sharedCourseId })
		.from(courses)
		.where(and(eq(courses.timetableId, timetableId), eq(courses.syncMode, 'synced')));
	const [termRows, periodRows, courseRows, termLinks, slotRows, cancelRows, calendarRows, moveRows, sharedRows, sharedSlots, sharedTeachers] = await db.batch([
		termsQuery(db, timetableId),
		periodsQuery(db, timetableId),
		db
			.select({
				id: courses.id,
				title: courses.title,
				color: courses.color,
				delivery: courses.delivery,
				intensiveFrom: courses.intensiveFrom,
				intensiveTo: courses.intensiveTo,
				credits: courses.credits,
				syncMode: courses.syncMode,
				sharedCourseId: courses.sharedCourseId,
				// Someone else changed the shared course since its owner last looked (only for them)
				changed: viewerId ? sharedChangedSql(viewerId) : sql<number>`0`
			})
			.from(courses)
			.where(eq(courses.timetableId, timetableId))
			.orderBy(asc(courses.createdAt)),
		db
			.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
			.from(courseTerms)
			.innerJoin(courses, eq(courseTerms.courseId, courses.id))
			.where(eq(courses.timetableId, timetableId)),
		db
			.select({
				courseId: courseSlots.courseId,
				weekday: courseSlots.weekday,
				period: courseSlots.periodNumber,
				span: courseSlots.span,
				week: courseSlots.weekPattern,
				room: courseSlots.room
			})
			.from(courseSlots)
			.innerJoin(courses, eq(courseSlots.courseId, courses.id))
			.where(eq(courses.timetableId, timetableId)),
		upcomingCancellations(db, timetableId, today),
		calendarQuery(db, timetableId, today),
		upcomingMoves(db, timetableId, today),
		...sharedCourseQueries(db, syncedIds)
	]);
	const shared = sharedCoursesFrom(sharedRows, sharedSlots, sharedTeachers);
	const votes = viewerId
		? await sharedCancellations(
				db,
				viewerId,
				courseRows.flatMap((c) => (c.syncMode === 'synced' && c.sharedCourseId ? [c.sharedCourseId] : [])),
				today
			)
		: [];

	return {
		terms: termRows,
		periods: periodRows,
		// Days off and exam periods from today on
		calendar: calendarRows,
		courses: courseRows.map(({ syncMode, sharedCourseId, ...c }) => {
			const synced = syncMode === 'synced' && sharedCourseId ? shared.get(sharedCourseId) : undefined;
			const values = synced
				? synced.values
				: { ...c, slots: slotRows.filter((s) => s.courseId === c.id).map(({ courseId: _, ...s }) => s) };
			return {
				id: c.id,
				color: c.color,
				title: values.title,
				slots: values.slots,
				delivery: values.delivery,
				intensiveFrom: values.intensiveFrom,
				intensiveTo: values.intensiveTo,
				credits: values.credits,
				termIds: termLinks.filter((l) => l.courseId === c.id).map((l) => l.termId),
				cancels: cancelRows.flatMap((r) => (r.courseId === c.id && r.date ? [r.date] : [])),
				sharedChanged: !!synced && !!c.changed,
				moves: moveRows.filter((m) => m.courseId === c.id).map(({ courseId: _, ...m }) => m),
				// Not the ones this person already marked themselves
				maybeCancels: votes
					.filter((v) => syncMode === 'synced' && v.sharedCourseId === sharedCourseId && v.n >= MAYBE_MIN)
					.map((v) => v.date)
					.filter((d) => !cancelRows.some((r) => r.courseId === c.id && r.date === d))
			};
		})
	};
}

/**
 * Several timetables at once, for laying them over each other: whose each is, terms,
 * periods and courses (with the shared course they are linked to), but nothing private
 * such as notes. `timetableIds` can be a subquery, which saves looking the ids up first.
 */
export async function loadTimetables(db: Db, timetableIds: string[] | SQLWrapper) {
	const out = new Map<
		string,
		{
			userId: string;
			terms: Awaited<ReturnType<typeof termsQuery>>;
			periods: Awaited<ReturnType<typeof periodsQuery>>;
			courses: {
				id: string;
				title: string;
				color: string;
				sharedCourseId: string | null;
				termIds: string[];
				slots: { weekday: number; period: number; span: number; room: string | null }[];
			}[];
		}
	>();
	const syncedIds = db
		.select({ id: courses.sharedCourseId })
		.from(courses)
		.where(and(inArray(courses.timetableId, timetableIds), eq(courses.syncMode, 'synced')));
	const [found, termRows, periodRows, courseRows, termLinks, slotRows, sharedRows, sharedSlots, sharedTeachers] = await db.batch([
		db
			.select({ id: timetables.id, userId: timetables.userId })
			.from(timetables)
			.where(inArray(timetables.id, timetableIds)),
		db
			.select({
				timetableId: terms.timetableId,
				id: terms.id,
				name: terms.name,
				groupName: terms.groupName,
				startDate: terms.startDate,
				endDate: terms.endDate
			})
			.from(terms)
			.where(inArray(terms.timetableId, timetableIds))
			.orderBy(asc(terms.sortOrder)),
		db
			.select({ timetableId: periods.timetableId, number: periods.number, start: periods.startTime, end: periods.endTime })
			.from(periods)
			.where(inArray(periods.timetableId, timetableIds))
			.orderBy(asc(periods.number)),
		db
			.select({
				timetableId: courses.timetableId,
				id: courses.id,
				title: courses.title,
				color: courses.color,
				syncMode: courses.syncMode,
				sharedCourseId: courses.sharedCourseId
			})
			.from(courses)
			.where(inArray(courses.timetableId, timetableIds))
			.orderBy(asc(courses.createdAt)),
		db
			.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
			.from(courseTerms)
			.innerJoin(courses, eq(courseTerms.courseId, courses.id))
			.where(inArray(courses.timetableId, timetableIds)),
		db
			.select({
				courseId: courseSlots.courseId,
				weekday: courseSlots.weekday,
				period: courseSlots.periodNumber,
				span: courseSlots.span,
				week: courseSlots.weekPattern,
				room: courseSlots.room
			})
			.from(courseSlots)
			.innerJoin(courses, eq(courseSlots.courseId, courses.id))
			.where(inArray(courses.timetableId, timetableIds)),
		...sharedCourseQueries(db, syncedIds)
	]);
	const shared = sharedCoursesFrom(sharedRows, sharedSlots, sharedTeachers);
	for (const { id, userId } of found) {
		out.set(id, {
			userId,
			terms: termRows.filter((t) => t.timetableId === id).map(({ timetableId: _, ...t }) => t),
			periods: periodRows.filter((p) => p.timetableId === id).map(({ timetableId: _, ...p }) => p),
			courses: courseRows
				.filter((c) => c.timetableId === id)
				.map((c) => {
					const synced = c.syncMode === 'synced' && c.sharedCourseId ? shared.get(c.sharedCourseId) : undefined;
					return {
						id: c.id,
						title: synced?.values.title ?? c.title,
						color: c.color,
						sharedCourseId: c.sharedCourseId,
						termIds: termLinks.filter((l) => l.courseId === c.id).map((l) => l.termId),
						slots:
							synced?.values.slots ??
							slotRows.filter((s) => s.courseId === c.id).map(({ courseId: _, ...s }) => s)
					};
				})
		});
	}
	return out;
}
