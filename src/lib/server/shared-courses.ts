import { and, asc, count, desc, eq, inArray, ne, or, sql, type SQLWrapper } from 'drizzle-orm';
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
	users,
	warnings
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
	credits: number | null;
};

// Fixed key order, so two sets of values compare equal as JSON
function normalize(v: SharedValues): SharedValues {
	return {
		title: v.title,
		teachers: v.teachers,
		slots: v.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, week: s.week ?? 'every', room: s.room })),
		delivery: v.delivery,
		intensiveFrom: v.intensiveFrom,
		intensiveTo: v.intensiveTo,
		credits: v.credits ?? null
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
	// When it was added and last changed (ms), for where the values come from (sharedSource)
	createdAt: number;
	updatedAt: number;
	values: SharedValues;
};

/**
 * A course's name as the timetable shows it, in a query that reads `courses` (unaliased): the
 * shared course's when it is synced, else its own.
 */
export const shownTitle = sql<string>`coalesce((select sc.title from shared_courses sc
	where "courses"."sync_mode" = 'synced' and sc.id = "courses"."shared_course_id"), "courses"."title")`;

/** The shared courses of the synced ones among these, by id; any other gets its own values */
export async function syncedValues(db: Db, rows: { syncMode: 'synced' | 'personal'; sharedCourseId: string | null }[]) {
	return loadSharedCourses(
		db,
		rows.flatMap((r) => (r.syncMode === 'synced' && r.sharedCourseId ? [r.sharedCourseId] : []))
	);
}

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
				createdAt: r.createdAt.getTime(),
				updatedAt: r.updatedAt.getTime(),
				values: normalize({
					title: r.title,
					teachers: teachers.filter((t) => t.sharedCourseId === r.id).map((t) => t.name),
					slots: slots
						.filter((s) => s.sharedCourseId === r.id)
						.map((s) => ({ weekday: s.weekday, period: s.periodNumber, span: s.span, week: s.weekPattern, room: s.room })),
					delivery: r.delivery,
					intensiveFrom: r.intensiveFrom,
					intensiveTo: r.intensiveTo,
					credits: r.credits
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
		intensiveTo: after.intensiveTo,
		credits: after.credits
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

// The edit that added a course to the shared data (it has nothing before it)
const firstEdit = sql`json_extract(${sharedCourseEdits.diff}, '$.before') is null`;

/** Who added the course to the shared data, for the admin; null for syllabus courses and deleted accounts */
export async function sharedCreator(db: Db, sharedCourseId: string) {
	const row = await db
		.select({ id: users.id, nickname: users.nickname })
		.from(sharedCourseEdits)
		.innerJoin(users, eq(users.id, sharedCourseEdits.userId))
		.where(and(eq(sharedCourseEdits.sharedCourseId, sharedCourseId), firstEdit))
		.orderBy(asc(sharedCourseEdits.createdAt))
		.get();
	return row ?? null;
}

/**
 * For the admin's page about a person: the shared courses they added and those they changed,
 * newest first (50 at most), so what someone suspended left behind can be found and deleted.
 */
export async function sharedCoursesBy(db: Db, userId: string) {
	return db
		.select({
			id: sharedCourses.id,
			title: sharedCourses.title,
			year: sharedCourses.year,
			university: sql<string>`(select u.name from universities u where u.id = "shared_courses"."university_id")`,
			created: sql<number>`max(case when json_extract("shared_course_edits"."diff", '$.before') is null then 1 else 0 end)`,
			edits: count()
		})
		.from(sharedCourseEdits)
		.innerJoin(sharedCourses, eq(sharedCourses.id, sharedCourseEdits.sharedCourseId))
		.where(eq(sharedCourseEdits.userId, userId))
		.groupBy(sharedCourses.id)
		.orderBy(desc(sql`max("shared_course_edits"."created_at")`))
		.limit(50);
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

/**
 * One page of the course's changes, newest first, and whether older ones follow. Who made each
 * one is only for the admin: the page leaves it out for everyone else.
 */
export async function loadEdits(db: Db, sharedCourseId: string, page = 1) {
	const rows = await db
		.select({
			id: sharedCourseEdits.id,
			diff: sharedCourseEdits.diff,
			createdAt: sharedCourseEdits.createdAt,
			userId: sharedCourseEdits.userId,
			nickname: users.nickname
		})
		.from(sharedCourseEdits)
		.leftJoin(users, eq(users.id, sharedCourseEdits.userId))
		.where(eq(sharedCourseEdits.sharedCourseId, sharedCourseId))
		// Times are to the second; rowid keeps edits within one second in the order they were saved.
		.orderBy(desc(sharedCourseEdits.createdAt), desc(sql`"shared_course_edits"."rowid"`))
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

/** Whether two courses may be the same class: a term in common, or no term on either */
export const sharesTerm = (a: { terms: string[] }, b: { terms: string[] }) =>
	!a.terms.length || !b.terms.length || a.terms.some((t) => b.terms.includes(t));

/** The admin's pick for courses with no term name */
export const NO_TERM = 'none';

/** The term names (Q1, 前期…) the university's shared courses of a year are tagged with */
export async function sharedTermNames(db: Db, universityId: string, year: number) {
	const rows = await db
		.select({ terms: sharedCourses.terms })
		.from(sharedCourses)
		.where(and(eq(sharedCourses.universityId, universityId), eq(sharedCourses.year, year)));
	return [...new Set(rows.flatMap((r) => r.terms))].sort(compareJa);
}

/**
 * For the admin: a university's shared courses of a year, by title, teacher or course code
 * (the first `limit` by title when there is no search), with how many people sync each and how
 * many have it at all. `term` keeps those tagged with that term name; `unused` those no
 * timetable has; `weekday` and `period` those meeting then (a period inside a longer class counts).
 * `term` of NO_TERM keeps those with no term name. `sharesTerm` keeps those with a term in common
 * with these (or with none), so a course isn't folded into one of another quarter.
 */
export async function adminSearchShared(
	db: Db,
	opts: {
		universityId: string;
		year: number;
		q: string;
		excludeId?: string;
		term?: string;
		sharesTerm?: string[];
		unused?: boolean;
		weekday?: number;
		period?: number;
		limit?: number;
	}
) {
	const rows = await db
		.select({ id: sharedCourses.id })
		.from(sharedCourses)
		.where(
			and(
				eq(sharedCourses.universityId, opts.universityId),
				eq(sharedCourses.year, opts.year),
				opts.q ? queryMatch(opts.q) : undefined,
				opts.excludeId ? ne(sharedCourses.id, opts.excludeId) : undefined,
				opts.term === NO_TERM
					? sql`json_array_length(${sharedCourses.terms}) = 0`
					: opts.term
						? sql`exists (select 1 from json_each(${sharedCourses.terms}) where json_each.value = ${opts.term})`
						: undefined,
				opts.sharesTerm?.length
					? sql`(json_array_length(${sharedCourses.terms}) = 0 or exists (select 1 from json_each(${sharedCourses.terms})
						where json_each.value in (${sql.join(
							opts.sharesTerm.slice(0, 20).map((t) => sql`${t}`),
							sql`, `
						)})))`
					: undefined,
				opts.unused
					? sql`not exists (select 1 from ${courses} where ${courses.sharedCourseId} = ${sharedCourses.id})`
					: undefined,
				opts.weekday || opts.period
					? sql`exists (select 1 from ${sharedCourseSlots} s where s.shared_course_id = ${sharedCourses.id}
						${opts.weekday ? sql`and s.weekday = ${opts.weekday}` : sql``}
						${opts.period ? sql`and s.period_number <= ${opts.period} and s.period_number + s.span > ${opts.period}` : sql``})`
					: undefined
			)
		)
		.orderBy(asc(sharedCourses.title))
		// The ids are read 90 at a time below (D1: at most 100 bound values).
		.limit(opts.limit ?? 50);
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
 * still linked so overlays group them).
 */
export async function usageCounts(db: Db, ids: string[]) {
	const chunks = [];
	for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
	const parts = await Promise.all(
		chunks.map((part) =>
			db
				.select({
					id: courses.sharedCourseId,
					linked: count(),
					synced: sql<number>`sum(case when ${courses.syncMode} = 'synced' then 1 else 0 end)`
				})
				.from(courses)
				.where(inArray(courses.sharedCourseId, part))
				.groupBy(courses.sharedCourseId)
		)
	);
	const rows = parts.flat();
	return new Map(rows.map((r) => [r.id ?? '', { linked: r.linked, synced: Number(r.synced) }]));
}

// Raw statements in a batch can't take bound values (drizzle's D1 batch fails on them), so the
// merge writes its few values as SQL literals: quotes doubled, which is all SQLite needs.
const literal = (v: string | number | null) =>
	v === null ? 'null' : typeof v === 'number' ? String(Number(v)) : `'${v.replace(/'/g, "''")}'`;

// Courses linked to `from` in a timetable that has `into` as well
const bothLinked = (from: string, into: string) =>
	sql`select a.id from courses a where a.shared_course_id = ${from}
		and a.timetable_id in (select b.timetable_id from courses b where b.shared_course_id = ${into})`;
const bothLinkedRaw = (from: string, into: string) =>
	`select a.id from courses a where a.shared_course_id = ${literal(from)}
		and a.timetable_id in (select b.timetable_id from courses b where b.shared_course_id = ${literal(into)})`;
// Of those, the ones still reading the shared values (not already 自分だけで使う)
const bothSyncedRaw = (from: string, into: string) => `${bothLinkedRaw(from, into)} and a.sync_mode = 'synced'`;

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
 * with the values they were seeing; one already their own keeps what they wrote), so nothing
 * is lost or doubled. Each course must still be at the version that was read, else the batch
 * stops at the guards and rolls back.
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
	const synced = bothSyncedRaw(from.id, into.id);
	const v = from.values;
	return [
		...guard(from),
		...guard(into),
		db.run(sql.raw(`delete from course_slots where course_id in (${synced})`)),
		db.run(sql.raw(`delete from course_teachers where course_id in (${synced})`)),
		db.run(
			sql.raw(`insert into course_slots (id, course_id, weekday, period_number, span, week_pattern, room)
			select lower(hex(randomblob(16))), a.id, s.weekday, s.period_number, s.span, s.week_pattern, s.room
			from courses a join shared_course_slots s on s.shared_course_id = a.shared_course_id
			where a.id in (${synced})`)
		),
		db.run(
			sql.raw(`insert into course_teachers (id, course_id, name, sort_order)
			select lower(hex(randomblob(16))), a.id, t.name, t.sort_order
			from courses a join shared_course_teachers t on t.shared_course_id = a.shared_course_id
			where a.id in (${synced})`)
		),
		db.run(
			sql.raw(`update courses set title = ${literal(v.title)}, delivery = ${literal(v.delivery)},
			intensive_from = ${literal(v.intensiveFrom)}, intensive_to = ${literal(v.intensiveTo)}, credits = ${literal(v.credits)},
			sync_mode = 'personal', shared_course_id = null where id in (${synced})`)
		),
		db.run(sql.raw(`update courses set shared_course_id = null where id in (${both})`)),
		db.update(courses).set({ sharedCourseId: into.id }).where(eq(courses.sharedCourseId, from.id)),
		db
			.update(reports)
			.set({ status: 'closed' })
			.where(and(eq(reports.targetType, 'shared_course'), eq(reports.targetId, from.id))),
		db.delete(sharedCourses).where(eq(sharedCourses.id, from.id))
	];
}

/**
 * For the admin's delete: how many people have the course, split into whoever added it and
 * the rest. `creatorCourses` are the creator's copies, which the delete removes.
 */
export async function removePreview(db: Db, sharedCourseId: string, creatorId: string | null) {
	const rows = await db
		.select({ id: courses.id, userId: timetables.userId })
		.from(courses)
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.where(eq(courses.sharedCourseId, sharedCourseId));
	const creatorCourses = rows.filter((r) => creatorId && r.userId === creatorId).map((r) => r.id);
	const others = new Set(rows.filter((r) => r.userId !== creatorId).map((r) => r.userId)).size;
	return { creatorCourses, others };
}

/**
 * Statements that delete a shared course whoever has it (an admin taking down something
 * improper). The creator's own copies go (their files must already be gone: see
 * deleteCourseFiles); everyone else keeps theirs as 自分だけで使う with the values they were
 * seeing, so their notes and tasks stay. Reports about it are closed, not deleted, and a
 * warning goes to the creator when one is given. The course must still be at the version that
 * was read, else the batch stops at the guard and rolls back.
 */
export function removeShared(
	db: Db,
	course: SharedCourse,
	{ creatorId, warning, adminId }: { creatorId: string | null; warning: string | null; adminId: string }
): BatchItem<'sqlite'>[] {
	const id = literal(course.id);
	const synced = `select a.id from courses a where a.shared_course_id = ${id} and a.sync_mode = 'synced'`;
	const v = course.values;
	return [
		db
			.update(sharedCourses)
			.set({ updatedAt: new Date() })
			.where(and(eq(sharedCourses.id, course.id), eq(sharedCourses.version, course.version))),
		db.run(sql`select json(case when changes() = 1 then 'true' else 'version conflict' end)`),
		...(creatorId
			? [
					db.run(
						sql.raw(`delete from courses where shared_course_id = ${id}
						and timetable_id in (select t.id from timetables t where t.user_id = ${literal(creatorId)})`)
					)
				]
			: []),
		db.run(sql.raw(`delete from course_slots where course_id in (${synced})`)),
		db.run(sql.raw(`delete from course_teachers where course_id in (${synced})`)),
		db.run(
			sql.raw(`insert into course_slots (id, course_id, weekday, period_number, span, week_pattern, room)
			select lower(hex(randomblob(16))), a.id, s.weekday, s.period_number, s.span, s.week_pattern, s.room
			from courses a join shared_course_slots s on s.shared_course_id = a.shared_course_id
			where a.id in (${synced})`)
		),
		db.run(
			sql.raw(`insert into course_teachers (id, course_id, name, sort_order)
			select lower(hex(randomblob(16))), a.id, t.name, t.sort_order
			from courses a join shared_course_teachers t on t.shared_course_id = a.shared_course_id
			where a.id in (${synced})`)
		),
		db.run(
			sql.raw(`update courses set title = ${literal(v.title)}, delivery = ${literal(v.delivery)},
			intensive_from = ${literal(v.intensiveFrom)}, intensive_to = ${literal(v.intensiveTo)}, credits = ${literal(v.credits)},
			sync_mode = 'personal' where id in (${synced})`)
		),
		db.update(courses).set({ sharedCourseId: null }).where(eq(courses.sharedCourseId, course.id)),
		db
			.update(reports)
			.set({ status: 'closed' })
			.where(
				or(
					and(eq(reports.targetType, 'shared_course'), eq(reports.targetId, course.id)),
					and(eq(reports.targetType, 'shared_cancel'), sql`${reports.targetId} like ${`${course.id}|%`}`)
				)
			),
		...(creatorId && warning ? [db.insert(warnings).values({ userId: creatorId, body: warning, sentBy: adminId })] : []),
		db.delete(sharedCourses).where(eq(sharedCourses.id, course.id))
	];
}
