import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Delivery } from '$lib/courses';
import type { Db } from './db';
import {
	courses,
	sharedCourseEdits,
	sharedCourseSlots,
	sharedCourseTeachers,
	sharedCourses
} from './db/schema';

type Slot = { weekday: number; period: number; span: number; room: string | null };

// What everyone syncing a course shares. Colors, terms taken and notes stay personal.
export type SharedValues = {
	title: string;
	teachers: string[];
	slots: Slot[];
	delivery: Delivery | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
};

// Fixed key order, so two sets of values compare equal as JSON
function normalize(v: SharedValues): SharedValues {
	return {
		title: v.title,
		teachers: v.teachers,
		slots: v.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, room: s.room })),
		delivery: v.delivery,
		intensiveFrom: v.intensiveFrom,
		intensiveTo: v.intensiveTo
	};
}

export type SharedCourse = {
	id: string;
	universityId: string;
	year: number;
	code: string | null;
	source: 'syllabus' | 'user';
	terms: string[];
	version: number;
	values: SharedValues;
};

export async function loadSharedCourses(db: Db, ids: string[]): Promise<Map<string, SharedCourse>> {
	if (!ids.length) return new Map();
	const [rows, slots, teachers] = await db.batch([
		db.select().from(sharedCourses).where(inArray(sharedCourses.id, ids)),
		db
			.select()
			.from(sharedCourseSlots)
			.where(inArray(sharedCourseSlots.sharedCourseId, ids))
			.orderBy(asc(sharedCourseSlots.weekday), asc(sharedCourseSlots.periodNumber)),
		db
			.select()
			.from(sharedCourseTeachers)
			.where(inArray(sharedCourseTeachers.sharedCourseId, ids))
			.orderBy(asc(sharedCourseTeachers.sortOrder))
	]);
	return new Map(
		rows.map((r) => [
			r.id,
			{
				id: r.id,
				universityId: r.universityId,
				year: r.year,
				code: r.code,
				source: r.source,
				terms: r.terms,
				version: r.version,
				values: normalize({
					title: r.title,
					teachers: teachers.filter((t) => t.sharedCourseId === r.id).map((t) => t.name),
					slots: slots
						.filter((s) => s.sharedCourseId === r.id)
						.map((s) => ({ weekday: s.weekday, period: s.periodNumber, span: s.span, room: s.room })),
					delivery: r.delivery,
					intensiveFrom: r.intensiveFrom,
					intensiveTo: r.intensiveTo
				})
			}
		])
	);
}

export async function loadSharedCourse(db: Db, id: string) {
	return (await loadSharedCourses(db, [id])).get(id) ?? null;
}

function insertDetails(db: Db, sharedCourseId: string, v: SharedValues): BatchItem<'sqlite'>[] {
	const statements: BatchItem<'sqlite'>[] = [];
	if (v.slots.length) {
		statements.push(
			db.insert(sharedCourseSlots).values(
				v.slots.map((s) => ({
					sharedCourseId,
					weekday: s.weekday,
					periodNumber: s.period,
					span: s.span,
					room: s.room
				}))
			)
		);
	}
	if (v.teachers.length) {
		statements.push(
			db
				.insert(sharedCourseTeachers)
				.values(v.teachers.map((name, sortOrder) => ({ sharedCourseId, name, sortOrder })))
		);
	}
	return statements;
}

// Statements that add the course to the shared data, or bring the shared course up to date
// and record the change. Nothing is written when the values are unchanged.
export function writeShared(
	db: Db,
	{
		userId,
		universityId,
		year,
		termNames,
		existing,
		values
	}: {
		userId: string;
		universityId: string;
		year: number;
		termNames: string[];
		existing: SharedCourse | null;
		values: SharedValues;
	}
): { id: string; statements: BatchItem<'sqlite'>[] } {
	const after = normalize(values);
	const fields = {
		title: after.title,
		delivery: after.delivery,
		intensiveFrom: after.intensiveFrom,
		intensiveTo: after.intensiveTo
	};

	if (existing) {
		if (JSON.stringify(existing.values) === JSON.stringify(after)) return { id: existing.id, statements: [] };
		return {
			id: existing.id,
			statements: [
				db
					.update(sharedCourses)
					.set({ ...fields, version: existing.version + 1, updatedAt: new Date() })
					.where(eq(sharedCourses.id, existing.id)),
				db.delete(sharedCourseSlots).where(eq(sharedCourseSlots.sharedCourseId, existing.id)),
				db.delete(sharedCourseTeachers).where(eq(sharedCourseTeachers.sharedCourseId, existing.id)),
				...insertDetails(db, existing.id, after),
				db
					.insert(sharedCourseEdits)
					.values({ sharedCourseId: existing.id, userId, diff: { before: existing.values, after } })
			]
		};
	}

	const id = crypto.randomUUID();
	return {
		id,
		statements: [
			db
				.insert(sharedCourses)
				.values({ id, universityId, year, terms: termNames, source: 'user', ...fields }),
			...insertDetails(db, id, after),
			db.insert(sharedCourseEdits).values({ sharedCourseId: id, userId, diff: { before: null, after } })
		]
	};
}

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Courses at a weekday and period (in the given term), or matching a search by title,
// teacher or course code. Courses already in the timetable are left out.
export async function searchSharedCourses(
	db: Db,
	opts: {
		universityId: string;
		year: number;
		timetableId: string;
		q: string;
		slot: { weekday: number; period: number } | null;
		termName: string | null;
	}
) {
	let match;
	if (opts.q) {
		const pattern = likePattern(opts.q);
		match = sql`(${sharedCourses.title} like ${pattern} escape '\\'
			or ${sharedCourses.code} like ${pattern} escape '\\'
			or exists (select 1 from ${sharedCourseTeachers}
				where ${sharedCourseTeachers.sharedCourseId} = ${sharedCourses.id}
				and ${sharedCourseTeachers.name} like ${pattern} escape '\\'))`;
	} else if (opts.slot) {
		match = sql`exists (select 1 from ${sharedCourseSlots}
			where ${sharedCourseSlots.sharedCourseId} = ${sharedCourses.id}
			and ${sharedCourseSlots.weekday} = ${opts.slot.weekday}
			and ${sharedCourseSlots.periodNumber} = ${opts.slot.period})`;
	} else {
		return [];
	}
	// In WHERE, drizzle qualifies these columns with their tables; in SELECT it doesn't,
	// so correlated subqueries stay here and the counting is a separate query.
	const notAdded = sql`not exists (select 1 from ${courses}
		where ${courses.timetableId} = ${opts.timetableId} and ${courses.sharedCourseId} = ${sharedCourses.id})`;

	const rows = await db
		.select({ id: sharedCourses.id, terms: sharedCourses.terms })
		.from(sharedCourses)
		.where(
			and(
				eq(sharedCourses.universityId, opts.universityId),
				eq(sharedCourses.year, opts.year),
				match,
				notAdded
			)
		)
		.orderBy(desc(sql`${sharedCourses.source} = 'syllabus'`), asc(sharedCourses.title))
		// D1 takes at most 100 bound values per query, and the ids go into IN (...) lists.
		.limit(60);

	// A search by name looks across terms; a slot only lists courses of the selected term.
	const ids = rows
		.filter((r) => opts.q || !opts.termName || !r.terms.length || r.terms.includes(opts.termName))
		.map((r) => r.id);
	if (!ids.length) return [];
	const [details, counts] = await Promise.all([
		loadSharedCourses(db, ids),
		db
			.select({ id: courses.sharedCourseId, n: count() })
			.from(courses)
			.where(and(inArray(courses.sharedCourseId, ids), eq(courses.syncMode, 'synced')))
			.groupBy(courses.sharedCourseId)
	]);
	const users = new Map(counts.map((c) => [c.id, c.n]));

	// Syllabus courses first, then the ones most people use
	return [...details.values()]
		.map((course) => ({ ...course, users: users.get(course.id) ?? 0 }))
		.sort(
			(a, b) =>
				Number(b.source === 'syllabus') - Number(a.source === 'syllabus') ||
				b.users - a.users ||
				a.values.title.localeCompare(b.values.title, 'ja')
		)
		.slice(0, 30);
}
