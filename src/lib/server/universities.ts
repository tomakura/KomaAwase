import { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from './db';
import { cleanText } from '$lib/text';
import { courses, reports, sharedCourses, timetables, universities, univVerifications, users, verifyTokens } from './db/schema';

export const UNIVERSITY_NAME_MAX = 40;
// A university someone typed in is offered to others once this many people use it, so a
// joke name or a typo stays with the one who wrote it
export const SUGGEST_MIN_USERS = 3;

// Full-width letters and odd spaces are folded so 「東京　大学」 and 「東京大学」 are one university.
export const normalizeUniversityName = cleanText;

// Names for the suggestions in はじめの設定 and 大学: the preset universities, and those
// that SUGGEST_MIN_USERS people or more use; presets first.
export function listUniversities(db: Db) {
	return db
		.select({
			id: universities.id,
			name: universities.name,
			source: universities.source,
			termPreset: universities.termPreset,
			periodPreset: universities.periodPreset
		})
		.from(universities)
		.where(
			or(
				eq(universities.source, 'preset'),
				sql`(select count(*) from ${users} where ${users.universityId} = ${universities.id}) >= ${SUGGEST_MIN_USERS}`
			)
		)
		// Sorted before the limit, so however many are added the presets stay in.
		.orderBy(desc(eq(universities.source, 'preset')), asc(universities.name))
		.limit(500);
}

/** The universities people typed in, with how many use each, for the admin page */
export function listUserUniversities(db: Db) {
	return db
		.select({ id: universities.id, name: universities.name, users: count(users.id) })
		.from(universities)
		.leftJoin(users, eq(users.universityId, universities.id))
		.where(eq(universities.source, 'user'))
		.groupBy(universities.id)
		.orderBy(desc(count(users.id)), asc(universities.name));
}

export function getUniversity(db: Db, id: string) {
	return db.select().from(universities).where(eq(universities.id, id)).get();
}

/** The university with this name, added as a user-made one (no presets) when it's new. */
export async function findOrCreateUniversity(db: Db, input: string, userId: string) {
	const name = normalizeUniversityName(input);
	if (!name || [...name].length > UNIVERSITY_NAME_MAX) return null;
	await db
		.insert(universities)
		.values({ name, source: 'user', createdBy: userId })
		.onConflictDoNothing({ target: universities.name });
	return (await db.select().from(universities).where(eq(universities.name, name)).get()) ?? null;
}

// Addresses on an allowed domain or a dot-separated subdomain of one. A plain suffix check
// would let notexample.ac.jp through for example.ac.jp.
export function emailMatchesDomains(email: string, domains: string[]) {
	const host = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
	return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** A university someone typed in, for the admin to rename or delete; presets are left alone */
export function getUserUniversity(db: Db, id: string) {
	return db
		.select({
			id: universities.id,
			name: universities.name,
			users: count(users.id),
			createdBy: universities.createdBy,
			creator: sql<string | null>`(select u.nickname from users u where u.id = "universities"."created_by")`
		})
		.from(universities)
		.leftJoin(users, eq(users.universityId, universities.id))
		.where(and(eq(universities.id, id), eq(universities.source, 'user')))
		.groupBy(universities.id)
		.get();
}

/** Renames a user-made university; null when the name is fine, else what is wrong */
export async function renameUniversity(db: Db, id: string, input: string) {
	const name = normalizeUniversityName(input);
	if (!name) return '名前を入力してください';
	if ([...name].length > UNIVERSITY_NAME_MAX) return `名前は${UNIVERSITY_NAME_MAX}文字までです`;
	const same = await db.select({ id: universities.id }).from(universities).where(eq(universities.name, name)).get();
	if (same && same.id !== id) return '同じ名前の大学がすでにあります';
	try {
		await db
			.update(universities)
			.set({ name })
			.where(and(eq(universities.id, id), eq(universities.source, 'user')));
	} catch {
		// Someone took the name between the check and the write
		return '同じ名前の大学がすでにあります';
	}
	return null;
}

/**
 * Deletes a user-made university (an unsuitable name). Whoever used it goes back to 未設定 and
 * keeps their timetables. Its shared courses go: courses synced to one become the person's own,
 * with the values they were seeing, so nothing in a timetable changes. One batch, so it all
 * happens or none of it does.
 */
export async function deleteUniversity(db: Db, id: string) {
	// Raw statements in a D1 batch can't take bound values, so the id goes in as text: ids are
	// UUIDs, and anything else is refused
	if (!/^[0-9a-zA-Z-]{1,64}$/.test(id)) return;
	// A preset university is never touched, nor anything that points at it
	const target = await db
		.select({ id: universities.id })
		.from(universities)
		.where(and(eq(universities.id, id), eq(universities.source, 'user')))
		.get();
	if (!target) return;
	const shared = db.select({ id: sharedCourses.id }).from(sharedCourses).where(eq(sharedCourses.universityId, id));
	const synced = `select c.id from courses c join shared_courses s on s.id = c.shared_course_id
		where s.university_id = '${id}' and c.sync_mode = 'synced'`;
	await db.batch([
		db.run(sql.raw(`delete from course_slots where course_id in (${synced})`)),
		db.run(sql.raw(`delete from course_teachers where course_id in (${synced})`)),
		db.run(
			sql.raw(`insert into course_slots (id, course_id, weekday, period_number, span, week_pattern, room)
			select lower(hex(randomblob(16))), c.id, s.weekday, s.period_number, s.span, s.week_pattern, s.room
			from courses c join shared_course_slots s on s.shared_course_id = c.shared_course_id
			where c.id in (${synced})`)
		),
		db.run(
			sql.raw(`insert into course_teachers (id, course_id, name, sort_order)
			select lower(hex(randomblob(16))), c.id, t.name, t.sort_order
			from courses c join shared_course_teachers t on t.shared_course_id = c.shared_course_id
			where c.id in (${synced})`)
		),
		db.run(
			sql.raw(`update courses set
			(title, delivery, intensive_from, intensive_to, credits) =
			(select s.title, s.delivery, s.intensive_from, s.intensive_to, s.credits from shared_courses s where s.id = courses.shared_course_id),
			sync_mode = 'personal'
			where id in (${synced})`)
		),
		db.update(courses).set({ sharedCourseId: null }).where(inArray(courses.sharedCourseId, shared)),
		db
			.update(reports)
			.set({ status: 'closed' })
			.where(and(eq(reports.targetType, 'shared_course'), inArray(reports.targetId, shared))),
		db.delete(sharedCourses).where(eq(sharedCourses.universityId, id)),
		db.update(users).set({ universityId: null }).where(eq(users.universityId, id)),
		db.update(timetables).set({ universityId: null }).where(eq(timetables.universityId, id)),
		db.delete(univVerifications).where(eq(univVerifications.universityId, id)),
		db.delete(verifyTokens).where(eq(verifyTokens.universityId, id)),
		db.delete(universities).where(and(eq(universities.id, id), eq(universities.source, 'user')))
	]);
}
