import { and, asc, count, desc, eq, inArray, ne, sql, type SQLWrapper } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Delivery, WeekPattern } from '$lib/courses';
import { compareJa } from '$lib/sort';
import type { Db } from './db';
import {
	courses,
	reports,
	sharedCourseEdits,
	sharedCourseSlots,
	sharedCourseTeachers,
	sharedCourses,
	timetables,
	univVerifications,
	users
} from './db/schema';

type Slot = { weekday: number; period: number; span: number; week: WeekPattern; room: string | null };

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
		slots: v.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, week: s.week ?? 'every', room: s.room })),
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

// D1 takes at most 100 bound values per query, so many ids are read 90 at a time.
const CHUNK = 90;

/**
 * The queries behind loadSharedCourses, for a list of ids or a subquery that gives them,
 * so a caller can run them in its own batch and read the rows with sharedCoursesFrom.
 */
export function sharedCourseQueries(db: Db, ids: string[] | SQLWrapper) {
	return [
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
	] as const;
}

export function sharedCoursesFrom(
	rows: (typeof sharedCourses.$inferSelect)[],
	slots: (typeof sharedCourseSlots.$inferSelect)[],
	teachers: (typeof sharedCourseTeachers.$inferSelect)[]
): Map<string, SharedCourse> {
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
						.map((s) => ({ weekday: s.weekday, period: s.periodNumber, span: s.span, week: s.weekPattern, room: s.room })),
					delivery: r.delivery,
					intensiveFrom: r.intensiveFrom,
					intensiveTo: r.intensiveTo
				})
			}
		])
	);
}

export async function loadSharedCourses(db: Db, ids: string[]): Promise<Map<string, SharedCourse>> {
	const unique = [...new Set(ids)];
	if (!unique.length) return new Map();
	const chunks = [];
	for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));
	const parts = await Promise.all(chunks.map((part) => db.batch(sharedCourseQueries(db, part))));
	return sharedCoursesFrom(
		parts.flatMap((p) => p[0]),
		parts.flatMap((p) => p[1]),
		parts.flatMap((p) => p[2])
	);
}

/**
 * Who may change a shared course for everyone: someone who has it in a timetable, synced,
 * and holds a current enrollment check for its university. Admins may always. Anyone at
 * the university can still add new courses, use this one as it is, keep their own copy
 * (自分だけで使う) and report it.
 */
export async function canEditShared(db: Db, userId: string, course: { id: string; universityId: string }) {
	const [[user], [synced], [verified]] = await db.batch([
		db.select({ role: users.role }).from(users).where(eq(users.id, userId)),
		db
			.select({ id: courses.id })
			.from(courses)
			.innerJoin(timetables, eq(timetables.id, courses.timetableId))
			.where(and(eq(timetables.userId, userId), eq(courses.sharedCourseId, course.id), eq(courses.syncMode, 'synced')))
			.limit(1),
		db
			.select({ userId: univVerifications.userId })
			.from(univVerifications)
			.where(
				and(
					eq(univVerifications.userId, userId),
					eq(univVerifications.universityId, course.universityId),
					sql`${univVerifications.expiresAt} > ${Date.now()}`
				)
			)
	]);
	return user?.role === 'admin' || (!!synced && !!verified);
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
					weekPattern: s.week,
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
// and record the change. Nothing is written when the values are unchanged (`changed` is false).
// An update only applies to the version that was read; if someone saved in between, the batch
// fails at the guard below and D1 rolls all of it back.
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
): { id: string; changed: boolean; statements: BatchItem<'sqlite'>[] } {
	const after = normalize(values);
	const fields = {
		title: after.title,
		delivery: after.delivery,
		intensiveFrom: after.intensiveFrom,
		intensiveTo: after.intensiveTo
	};

	if (existing) {
		if (JSON.stringify(existing.values) === JSON.stringify(after)) {
			return { id: existing.id, changed: false, statements: [] };
		}
		return {
			id: existing.id,
			changed: true,
			statements: [
				db
					.update(sharedCourses)
					.set({ ...fields, version: existing.version + 1, updatedAt: new Date() })
					.where(and(eq(sharedCourses.id, existing.id), eq(sharedCourses.version, existing.version))),
				// SQLite has no RAISE outside triggers; json() on bad input is an error that stops the batch.
				db.run(sql`select json(case when changes() = 1 then 'true' else 'version conflict' end)`),
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
		changed: true,
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

// A search by title, teacher or course code
const queryMatch = (q: string) => {
	const pattern = likePattern(q);
	return sql`(${sharedCourses.title} like ${pattern} escape '\\'
		or ${sharedCourses.code} like ${pattern} escape '\\'
		or exists (select 1 from ${sharedCourseTeachers}
			where ${sharedCourseTeachers.sharedCourseId} = ${sharedCourses.id}
			and ${sharedCourseTeachers.name} like ${pattern} escape '\\'))`;
};

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
		match = queryMatch(opts.q);
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
				compareJa(a.values.title, b.values.title)
		)
		.slice(0, 30);
}

export const EDITS_PAGE = 50;

/** One page of the course's changes, newest first, and whether older ones follow. Who made them is never shown. */
export async function loadEdits(db: Db, sharedCourseId: string, page = 1) {
	const rows = await db
		.select({ id: sharedCourseEdits.id, diff: sharedCourseEdits.diff, createdAt: sharedCourseEdits.createdAt })
		.from(sharedCourseEdits)
		.where(eq(sharedCourseEdits.sharedCourseId, sharedCourseId))
		// Times are to the second; rowid keeps edits within one second in the order they were saved.
		.orderBy(desc(sharedCourseEdits.createdAt), desc(sql`rowid`))
		.limit(EDITS_PAGE + 1)
		.offset((page - 1) * EDITS_PAGE);
	return { edits: rows.slice(0, EDITS_PAGE), more: rows.length > EDITS_PAGE };
}

/**
 * Puts the course back to how it was after an earlier edit, as a new edit (so that can be
 * undone too). A message comes back when someone changed it since the page was opened.
 */
export async function restoreShared(
	db: Db,
	{ userId, course, editId, version }: { userId: string; course: SharedCourse; editId: string; version: number }
) {
	if (course.version !== version) return { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください' };
	const edit = await db
		.select({ diff: sharedCourseEdits.diff })
		.from(sharedCourseEdits)
		.where(and(eq(sharedCourseEdits.id, editId), eq(sharedCourseEdits.sharedCourseId, course.id)))
		.get();
	const values = edit?.diff.after as SharedValues | null | undefined;
	if (!values) return { message: 'その版が見つかりません' };
	const written = writeShared(db, {
		userId,
		universityId: course.universityId,
		year: course.year,
		termNames: course.terms,
		existing: course,
		values
	});
	if (!written.changed) return { message: 'いまの内容と同じです' };
	try {
		await db.batch(written.statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
	} catch {
		return { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください' };
	}
	return { restored: true };
}

/** How many timetables sync the course */
export async function syncedCount(db: Db, sharedCourseId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(courses)
		.where(and(eq(courses.sharedCourseId, sharedCourseId), eq(courses.syncMode, 'synced')));
	return row?.n ?? 0;
}

/**
 * For the admin: a university's shared courses of a year, by title, teacher or course code
 * (the first 50 by title when there is no search), with how many people sync each.
 */
export async function adminSearchShared(
	db: Db,
	opts: { universityId: string; year: number; q: string; excludeId?: string }
) {
	const rows = await db
		.select({ id: sharedCourses.id })
		.from(sharedCourses)
		.where(
			and(
				eq(sharedCourses.universityId, opts.universityId),
				eq(sharedCourses.year, opts.year),
				opts.q ? queryMatch(opts.q) : undefined,
				opts.excludeId ? ne(sharedCourses.id, opts.excludeId) : undefined
			)
		)
		.orderBy(asc(sharedCourses.title))
		// The ids go into IN (...) lists below (D1: at most 100 bound values).
		.limit(50);
	const ids = rows.map((r) => r.id);
	if (!ids.length) return [];
	const [details, usage] = await Promise.all([loadSharedCourses(db, ids), usageCounts(db, ids)]);
	return ids.flatMap((id) => {
		const course = details.get(id);
		return course ? [{ ...course, users: usage.get(id)?.synced ?? 0, using: usage.get(id)?.linked ?? 0 }] : [];
	});
}

/**
 * For the admin: how many timetables sync each course (`synced`) and how many have it at all
 * (`linked`), which includes those that stopped syncing and kept their own copy (自分だけで使う,
 * still linked so overlays group them). Up to 90 ids at a time.
 */
export async function usageCounts(db: Db, ids: string[]) {
	const rows = ids.length
		? await db
				.select({
					id: courses.sharedCourseId,
					linked: count(),
					synced: sql<number>`sum(case when ${courses.syncMode} = 'synced' then 1 else 0 end)`
				})
				.from(courses)
				.where(inArray(courses.sharedCourseId, ids.slice(0, CHUNK)))
				.groupBy(courses.sharedCourseId)
		: [];
	return new Map(rows.map((r) => [r.id ?? '', { linked: r.linked, synced: Number(r.synced) }]));
}

/**
 * Statements that delete a shared course nobody has in a timetable, with its history and the
 * reports about it. The delete only happens while no course links to it: if someone added it
 * since the page was read, the guard stops the batch and D1 rolls it back.
 */
export function deleteShared(db: Db, id: string): BatchItem<'sqlite'>[] {
	return [
		db
			.delete(sharedCourses)
			.where(
				and(
					eq(sharedCourses.id, id),
					sql`not exists (select 1 from ${courses} where ${courses.sharedCourseId} = ${sharedCourses.id})`
				)
			),
		db.run(sql`select json(case when changes() = 1 then 'true' else 'in use' end)`),
		db.delete(reports).where(and(eq(reports.targetType, 'shared_course'), eq(reports.targetId, id)))
	];
}

// Raw statements in a batch can't take bound values (drizzle's D1 batch fails on them), so the
// merge writes its few values as SQL literals: quotes doubled, which is all SQLite needs.
const literal = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);

// Courses linked to `from` in a timetable that has `into` as well
const bothLinked = (from: string, into: string) =>
	sql`select a.id from courses a where a.shared_course_id = ${from}
		and a.timetable_id in (select b.timetable_id from courses b where b.shared_course_id = ${into})`;
const bothLinkedRaw = (from: string, into: string) =>
	`select a.id from courses a where a.shared_course_id = ${literal(from)}
		and a.timetable_id in (select b.timetable_id from courses b where b.shared_course_id = ${literal(into)})`;

/** How many people a merge of `from` into `into` reaches, and how many of them have both */
export async function mergePreview(db: Db, from: string, into: string) {
	const [linked, both] = await Promise.all([
		db.all<{ n: number }>(
			sql`select count(distinct t.user_id) as n from courses c join timetables t on t.id = c.timetable_id where c.shared_course_id = ${from}`
		),
		db.all<{ n: number }>(
			sql`select count(distinct t.user_id) as n from courses c join timetables t on t.id = c.timetable_id where c.id in (${bothLinked(from, into)})`
		)
	]);
	return { people: Number(linked[0]?.n ?? 0), both: Number(both[0]?.n ?? 0) };
}

/**
 * Statements that fold shared course `from` into `into`: everyone linked to `from` is linked
 * to `into` and reads its values; `from` is deleted with its history, and reports about it
 * are closed. Someone with both in one timetable keeps `from` as their own (自分だけで使う,
 * with the values they were seeing), so nothing is lost or doubled. Each course must still
 * be at the version that was read, else the batch stops at the guards and rolls back.
 */
export function mergeShared(db: Db, from: SharedCourse, into: SharedCourse): BatchItem<'sqlite'>[] {
	const guard = (c: SharedCourse) => [
		db
			.update(sharedCourses)
			.set({ updatedAt: new Date() })
			.where(and(eq(sharedCourses.id, c.id), eq(sharedCourses.version, c.version))),
		db.run(sql`select json(case when changes() = 1 then 'true' else 'version conflict' end)`)
	];
	const both = bothLinkedRaw(from.id, into.id);
	const v = from.values;
	return [
		...guard(from),
		...guard(into),
		db.run(sql.raw(`delete from course_slots where course_id in (${both})`)),
		db.run(sql.raw(`delete from course_teachers where course_id in (${both})`)),
		db.run(
			sql.raw(`insert into course_slots (id, course_id, weekday, period_number, span, week_pattern, room)
			select lower(hex(randomblob(16))), a.id, s.weekday, s.period_number, s.span, s.week_pattern, s.room
			from courses a join shared_course_slots s on s.shared_course_id = a.shared_course_id
			where a.id in (${both})`)
		),
		db.run(
			sql.raw(`insert into course_teachers (id, course_id, name, sort_order)
			select lower(hex(randomblob(16))), a.id, t.name, t.sort_order
			from courses a join shared_course_teachers t on t.shared_course_id = a.shared_course_id
			where a.id in (${both})`)
		),
		db.run(
			sql.raw(`update courses set title = ${literal(v.title)}, delivery = ${literal(v.delivery)},
			intensive_from = ${literal(v.intensiveFrom)}, intensive_to = ${literal(v.intensiveTo)},
			sync_mode = 'personal', shared_course_id = null where id in (${both})`)
		),
		db.update(courses).set({ sharedCourseId: into.id }).where(eq(courses.sharedCourseId, from.id)),
		db
			.update(reports)
			.set({ status: 'closed' })
			.where(and(eq(reports.targetType, 'shared_course'), eq(reports.targetId, from.id))),
		db.delete(sharedCourses).where(eq(sharedCourses.id, from.id))
	];
}
