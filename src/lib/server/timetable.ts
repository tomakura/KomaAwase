import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq } from 'drizzle-orm';
import { academicYear, tokyoTime } from '$lib/time';
import type { Db } from './db';
import { courseSlots, courseTerms, courses, periods, terms, timetables, universities } from './db/schema';
import { upcomingCancellations } from './notes';
import { loadSharedCourses } from './shared-courses';

// The only preset so far. Picking a university comes with the setup screen.
const DEFAULT_UNIVERSITY_ID = 'dhw';

function findTimetable(db: Db, userId: string, year: number) {
	return db
		.select({ id: timetables.id, year: timetables.year, universityId: timetables.universityId })
		.from(timetables)
		.where(and(eq(timetables.userId, userId), eq(timetables.year, year)))
		.get();
}

// Returns the user's timetable for the year, copying terms and periods from the preset
// the first time.
export async function getOrCreateTimetable(db: Db, userId: string, year: number) {
	const existing = await findTimetable(db, userId, year);
	if (existing) return existing;

	const university = await db
		.select()
		.from(universities)
		.where(eq(universities.id, DEFAULT_UNIVERSITY_ID))
		.get();
	if (!university) throw new Error(`University preset "${DEFAULT_UNIVERSITY_ID}" is missing`);

	const timetableId = crypto.randomUUID();
	const termRows = (university.termPreset ?? []).map((t, i) => {
		// Preset dates are for one year; an outdated preset still gives the term names.
		const dated = !!t.start && academicYear(t.start) === year;
		return {
			timetableId,
			name: t.name,
			groupName: t.group ?? null,
			startDate: dated ? t.start : null,
			endDate: dated ? (t.end ?? null) : null,
			sortOrder: i
		};
	});
	const periodRows = (university.periodPreset ?? []).map((p) => ({
		timetableId,
		number: p.number,
		startTime: p.start,
		endTime: p.end
	}));

	const rest: BatchItem<'sqlite'>[] = [];
	if (termRows.length) rest.push(db.insert(terms).values(termRows));
	if (periodRows.length) rest.push(db.insert(periods).values(periodRows));
	try {
		await db.batch([
			db.insert(timetables).values({
				id: timetableId,
				userId,
				universityId: university.id,
				year,
				name: `${year}年度`
			}),
			...rest
		]);
	} catch (e) {
		// A parallel request (a link preload, say) created it first.
		const created = await findTimetable(db, userId, year);
		if (created) return created;
		throw e;
	}
	return { id: timetableId, year, universityId: university.id };
}

// The timetable for this academic year
export function currentTimetable(db: Db, userId: string) {
	return getOrCreateTimetable(db, userId, academicYear(tokyoTime(Date.now()).date));
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
