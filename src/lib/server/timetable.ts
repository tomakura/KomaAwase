import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq } from 'drizzle-orm';
import { academicYear } from '$lib/time';
import type { Db } from './db';
import { periods, terms, timetables, universities } from './db/schema';

// The only preset so far. Picking a university comes with the setup screen.
const DEFAULT_UNIVERSITY_ID = 'dhw';

function findTimetable(db: Db, userId: string, year: number) {
	return db
		.select({ id: timetables.id, year: timetables.year })
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
	return { id: timetableId, year };
}
