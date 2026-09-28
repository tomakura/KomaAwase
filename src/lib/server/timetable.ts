import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { DEFAULT_PERIODS, termTemplate, type PeriodInput, type TermInput } from '$lib/presets';
import { remapTerm } from '$lib/terms';
import { academicYear, isDate, tokyoTime } from '$lib/time';
import type { Db } from './db';
import { courseSlots, courseTerms, courses, periods, terms, timetables } from './db/schema';
import { upcomingCancellations } from './notes';
import { loadSharedCourses } from './shared-courses';
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
export async function getOrCreateTimetable(db: Db, owner: Owner, year: number) {
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
export function currentTimetable(db: Db, owner: Owner) {
	return getOrCreateTimetable(db, owner, academicYear(tokyoTime(Date.now()).date));
}

const termsQuery = (db: Db, timetableId: string) =>
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

const periodsQuery = (db: Db, timetableId: string) =>
	db
		.select({ number: periods.number, start: periods.startTime, end: periods.endTime })
		.from(periods)
		.where(eq(periods.timetableId, timetableId))
		.orderBy(asc(periods.number));

// Terms and periods, for forms that place a course in the timetable
export async function loadShape(db: Db, timetableId: string) {
	const [termRows, periodRows] = await db.batch([termsQuery(db, timetableId), periodsQuery(db, timetableId)]);
	return { terms: termRows, periods: periodRows };
}

const words = new Intl.Segmenter('ja', { granularity: 'word' });
const OPENING_BRACKET = /[（(「『【［\[〈《〔]$/u;

// Where a course title may wrap: between words, with one-character pieces (学, Ⅱ, A, ）)
// kept on the word before and opening brackets on the word after,
// e.g. 統計学|入門, 線形|代数Ⅱ, 映像|表現論|（前半）. BudouX keeps such compounds whole.
export function titleParts(title: string) {
	const parts: string[] = [];
	for (const { segment } of words.segment(title)) {
		const prev = parts.at(-1);
		const joins =
			prev !== undefined &&
			(OPENING_BRACKET.test(prev) || ([...segment].length === 1 && !OPENING_BRACKET.test(segment)));
		if (joins) parts[parts.length - 1] += segment;
		else parts.push(segment);
	}
	return parts;
}

// `today` (YYYY-MM-DD) picks the cancellations still to come.
export async function loadTimetable(db: Db, timetableId: string, today: string) {
	const [termRows, periodRows, courseRows, termLinks, slotRows, cancelRows] = await db.batch([
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
				syncMode: courses.syncMode,
				sharedCourseId: courses.sharedCourseId
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
		upcomingCancellations(db, timetableId, today)
	]);

	// Synced courses show the shared title, slots and rooms.
	const shared = await loadSharedCourses(
		db,
		courseRows.flatMap((c) => (c.syncMode === 'synced' && c.sharedCourseId ? [c.sharedCourseId] : []))
	);

	return {
		terms: termRows,
		periods: periodRows,
		courses: courseRows.map(({ syncMode, sharedCourseId, ...c }) => {
			const synced = syncMode === 'synced' && sharedCourseId ? shared.get(sharedCourseId) : undefined;
			const values = synced
				? synced.values
				: { ...c, slots: slotRows.filter((s) => s.courseId === c.id).map(({ courseId: _, ...s }) => s) };
			return {
				id: c.id,
				color: c.color,
				title: values.title,
				titleParts: titleParts(values.title),
				slots: values.slots,
				delivery: values.delivery,
				intensiveFrom: values.intensiveFrom,
				intensiveTo: values.intensiveTo,
				termIds: termLinks.filter((l) => l.courseId === c.id).map((l) => l.termId),
				cancels: cancelRows.flatMap((r) => (r.courseId === c.id && r.date ? [r.date] : []))
			};
		})
	};
}

/**
 * Several timetables at once, for laying them over each other: terms, periods and courses
 * (with the shared course they are linked to), but nothing private such as notes.
 */
export async function loadTimetables(db: Db, timetableIds: string[]) {
	const ids = [...new Set(timetableIds)];
	const out = new Map<
		string,
		{
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
	if (!ids.length) return out;
	const [termRows, periodRows, courseRows, termLinks, slotRows] = await db.batch([
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
			.where(inArray(terms.timetableId, ids))
			.orderBy(asc(terms.sortOrder)),
		db
			.select({ timetableId: periods.timetableId, number: periods.number, start: periods.startTime, end: periods.endTime })
			.from(periods)
			.where(inArray(periods.timetableId, ids))
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
			.where(inArray(courses.timetableId, ids))
			.orderBy(asc(courses.createdAt)),
		db
			.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
			.from(courseTerms)
			.innerJoin(courses, eq(courseTerms.courseId, courses.id))
			.where(inArray(courses.timetableId, ids)),
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
			.where(inArray(courses.timetableId, ids))
	]);
	const shared = await loadSharedCourses(
		db,
		courseRows.flatMap((c) => (c.syncMode === 'synced' && c.sharedCourseId ? [c.sharedCourseId] : []))
	);
	for (const id of ids) {
		out.set(id, {
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
