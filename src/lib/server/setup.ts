import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq } from 'drizzle-orm';
import { parseDays, parsePeriods, periodsProblem, type PeriodInput, type TermInput } from '$lib/presets';
import { parseTerms, termsProblem } from '$lib/terms';
import type { Theme } from '$lib/theme';
import { academicYear, tokyoTime } from '$lib/time';
import type { Db } from './db';
import { courseSlots, courses, timetables, universities, users } from './db/schema';
import { listUniversities } from './universities';
import { createTimetable, loadShape, periodStatements, startingShape, termStatements, type Owner } from './timetable';

const THEMES: Theme[] = ['system', 'light', 'dark'];

export const thisYear = () => academicYear(tokyoTime(Date.now()).date);

// Presets as the editors take them; dates only when they are for `year`.
export function presetsFor(list: Awaited<ReturnType<typeof listUniversities>>, year: number) {
	return list.flatMap((u) =>
		u.source === 'preset' && u.termPreset?.length && u.periodPreset?.length
			? [
					{
						name: u.name,
						terms: u.termPreset.map((t) => {
							const dated = !!t.start && academicYear(t.start) === year;
							return {
								name: t.name,
								group: t.group ?? null,
								start: dated ? (t.start ?? null) : null,
								end: dated ? (t.end ?? null) : null
							};
						}),
						periods: u.periodPreset
					}
				]
			: []
	);
}

// What the timetable looks like now, or would look like if it were made today
export async function timetableSettings(db: Db, owner: Owner, year: number) {
	const timetable = await db
		.select({ id: timetables.id, universityId: timetables.universityId })
		.from(timetables)
		.where(and(eq(timetables.userId, owner.id), eq(timetables.year, year)))
		.get();
	if (timetable) {
		const [shape, used, university] = await Promise.all([
			loadShape(db, timetable.id),
			db
				.selectDistinct({ number: courseSlots.periodNumber })
				.from(courseSlots)
				.innerJoin(courses, eq(courseSlots.courseId, courses.id))
				.where(eq(courses.timetableId, timetable.id)),
			timetable.universityId
				? db.select({ name: universities.name }).from(universities).where(eq(universities.id, timetable.universityId)).get()
				: undefined
		]);
		return {
			timetableId: timetable.id,
			universityName: university?.name ?? '',
			terms: shape.terms.map(
				(t): TermInput => ({ id: t.id, name: t.name, group: t.groupName, start: t.startDate, end: t.endDate })
			),
			periods: shape.periods,
			usedPeriods: used.map((u) => u.number)
		};
	}
	const shape = await startingShape(db, owner, year);
	const university = shape.universityId
		? await db.select({ name: universities.name }).from(universities).where(eq(universities.id, shape.universityId)).get()
		: undefined;
	return {
		timetableId: null,
		universityName: university?.name ?? '',
		terms: shape.terms,
		periods: shape.periods,
		usedPeriods: [] as number[]
	};
}

export type ShapeForm = { terms: TermInput[]; periods: PeriodInput[] };

/** Terms and periods from the form, or the message to show. */
export function readShape(form: FormData): ShapeForm | { message: string } {
	const terms = parseTerms(String(form.get('terms') ?? ''));
	const periods = parsePeriods(String(form.get('periods') ?? ''));
	if (!terms || !periods) return { message: '入力を読み取れませんでした。もう一度お試しください' };
	const problem = termsProblem(terms) ?? periodsProblem(periods);
	return problem ? { message: problem } : { terms, periods };
}

export function readDays(form: FormData) {
	return parseDays(String(form.get('days') ?? ''));
}

export function readTheme(form: FormData): Theme | null {
	const theme = String(form.get('theme') ?? '');
	return (THEMES as string[]).includes(theme) ? (theme as Theme) : null;
}

/**
 * Saves the timetable's university, terms and periods for `year`, making the timetable
 * if there isn't one, together with `userChanges` for the user row.
 */
export async function saveTimetableShape(
	db: Db,
	owner: Owner,
	year: number,
	shape: ShapeForm & { universityId: string | null },
	userChanges: Partial<typeof users.$inferInsert> = {}
) {
	const settings = await timetableSettings(db, owner, year);
	const userUpdate = db
		.update(users)
		.set({ ...userChanges, universityId: shape.universityId })
		.where(eq(users.id, owner.id));
	if (!settings.timetableId) {
		await createTimetable(db, owner, year, shape);
		await userUpdate;
		return;
	}
	const statements: BatchItem<'sqlite'>[] = [
		db.update(timetables).set({ universityId: shape.universityId }).where(eq(timetables.id, settings.timetableId)),
		...(await termStatements(db, settings.timetableId, shape.terms)),
		...periodStatements(db, settings.timetableId, shape.periods),
		userUpdate
	];
	await db.batch(statements as Batch);
}

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

export async function saveTerms(db: Db, timetableId: string, input: TermInput[]) {
	await db.batch((await termStatements(db, timetableId, input)) as Batch);
}

export async function savePeriods(db: Db, timetableId: string, input: PeriodInput[]) {
	await db.batch(periodStatements(db, timetableId, input) as Batch);
}
