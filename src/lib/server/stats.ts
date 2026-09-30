import { count, countDistinct, eq, gt, gte, sql } from 'drizzle-orm';
import { addDays, tokyoTime } from '$lib/time';
import { fillDays, type DayCount } from '$lib/stats';
import type { Db } from './db';
import {
	classReminders,
	courseAbsences,
	courseNotes,
	courses,
	dailyStats,
	events,
	friendships,
	groups,
	pushSubscriptions,
	sessions,
	sharedCourses,
	timetables,
	univVerifications,
	universities,
	users
} from './db/schema';

const DAY = 24 * 60 * 60 * 1000;
export const GRAPH_DAYS = 30;

// People who used the app since then: the latest use of each of their sign-ins (kept at most once
// an hour by the session check)
const seenSince = (db: Db, ms: number) =>
	db.select({ n: countDistinct(sessions.userId) }).from(sessions).where(gte(sessions.lastUsedAt, new Date(ms)));

const jstDay = (column: unknown) => sql<string>`date(${column} / 1000, 'unixepoch', '+9 hours')`;

/** Written by the daily cron: today's opened-the-app counts, which can't be worked out later */
export async function recordDailyStats(db: Db, now = Date.now()) {
	const date = tokyoTime(now).date;
	const [[total], [day], [week], [verified]] = await db.batch([
		db.select({ n: count() }).from(users),
		seenSince(db, now - DAY),
		seenSince(db, now - 7 * DAY),
		db.select({ n: count() }).from(univVerifications).where(gt(univVerifications.expiresAt, new Date(now)))
	]);
	const row = { date, users: total?.n ?? 0, activeDay: day?.n ?? 0, activeWeek: week?.n ?? 0, verified: verified?.n ?? 0 };
	await db.insert(dailyStats).values(row).onConflictDoUpdate({ target: dailyStats.date, set: row });
}

export async function loadStats(db: Db, now = Date.now()) {
	const today = tokyoTime(now).date;
	const since = new Date(now - GRAPH_DAYS * DAY);
	const one = (q: { n: unknown }[]) => Number(q[0]?.n ?? 0);
	const [
		users_,
		newWeek,
		day,
		week,
		month,
		verified,
		suspended,
		pushPeople,
		reminderPeople,
		signups,
		opened,
		timetables_,
		courses_,
		synced,
		shared,
		friends,
		groups_,
		events_,
		tasks,
		cancels,
		absences,
		byUniversity
	] = await db.batch([
		db.select({ n: count() }).from(users),
		db.select({ n: count() }).from(users).where(gte(users.createdAt, new Date(now - 7 * DAY))),
		seenSince(db, now - DAY),
		seenSince(db, now - 7 * DAY),
		seenSince(db, now - 30 * DAY),
		db.select({ n: count() }).from(univVerifications).where(gt(univVerifications.expiresAt, new Date(now))),
		db.select({ n: count() }).from(users).where(sql`${users.suspendedAt} is not null`),
		db.select({ n: countDistinct(pushSubscriptions.userId) }).from(pushSubscriptions),
		db.select({ n: countDistinct(classReminders.userId) }).from(classReminders),
		db
			.select({ date: jstDay(users.createdAt), n: count() })
			.from(users)
			.where(gte(users.createdAt, since))
			.groupBy(jstDay(users.createdAt)),
		db
			.select({ date: dailyStats.date, n: dailyStats.activeDay })
			.from(dailyStats)
			.where(gte(dailyStats.date, addDays(today, -(GRAPH_DAYS - 1)))),
		db.select({ n: count() }).from(timetables),
		db.select({ n: count() }).from(courses),
		db.select({ n: count() }).from(courses).where(eq(courses.syncMode, 'synced')),
		db.select({ n: count() }).from(sharedCourses),
		db.select({ n: count() }).from(friendships).where(eq(friendships.status, 'accepted')),
		db.select({ n: count() }).from(groups),
		db.select({ n: count() }).from(events),
		db.select({ n: count() }).from(courseNotes).where(eq(courseNotes.kind, 'task')),
		db.select({ n: count() }).from(courseNotes).where(eq(courseNotes.kind, 'cancel')),
		db.select({ n: count() }).from(courseAbsences),
		db
			.select({ name: universities.name, n: count() })
			.from(users)
			.leftJoin(universities, eq(universities.id, users.universityId))
			.groupBy(users.universityId)
			.orderBy(sql`count(*) desc`)
			.limit(10)
	]);

	return {
		today,
		users: one(users_),
		newWeek: one(newWeek),
		activeDay: one(day),
		activeWeek: one(week),
		activeMonth: one(month),
		verified: one(verified),
		suspended: one(suspended),
		pushPeople: one(pushPeople),
		reminderPeople: one(reminderPeople),
		signups: fillDays(signups as DayCount[], today, GRAPH_DAYS),
		// Only the days the cron has recorded; earlier ones stay empty
		opened: fillDays(opened as DayCount[], today, GRAPH_DAYS),
		openedSince: (opened as DayCount[]).map((d) => d.date).sort()[0] ?? null,
		timetables: one(timetables_),
		courses: one(courses_),
		synced: one(synced),
		shared: one(shared),
		friends: one(friends),
		groups: one(groups_),
		events: one(events_),
		tasks: one(tasks),
		cancels: one(cancels),
		absences: one(absences),
		byUniversity: (byUniversity as { name: string | null; n: number }[]).map((u) => ({ name: u.name ?? '未設定', n: u.n }))
	};
}
