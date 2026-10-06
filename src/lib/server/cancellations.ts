import { and, countDistinct, eq, gt, gte, inArray, isNull, ne } from 'drizzle-orm';
import { CANCEL_REPORT_REASON } from '$lib/cancellations';
import type { Db } from './db';
import { cancellationHides, courseNotes, courses, reports, timetables, univVerifications, users } from './db/schema';

export type CancelVotes = { sharedCourseId: string; date: string; n: number };

/**
 * For each of these shared courses, the days from `today` that other people have marked as
 * cancelled, and how many. Only people with a current enrollment check, syncing the class,
 * who share their cancellations and are not suspended count; a day the admin took down doesn't.
 */
export async function sharedCancellations(
	db: Db,
	viewerId: string,
	sharedCourseIds: string[],
	today: string
): Promise<CancelVotes[]> {
	if (!sharedCourseIds.length) return [];
	const rows = await db
		.select({ sharedCourseId: courses.sharedCourseId, date: courseNotes.date, n: countDistinct(timetables.userId) })
		.from(courseNotes)
		.innerJoin(courses, eq(courseNotes.courseId, courses.id))
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.innerJoin(users, eq(timetables.userId, users.id))
		.innerJoin(
			univVerifications,
			and(
				eq(univVerifications.userId, users.id),
				eq(univVerifications.universityId, timetables.universityId),
				gt(univVerifications.expiresAt, new Date())
			)
		)
		.leftJoin(
			cancellationHides,
			and(eq(cancellationHides.sharedCourseId, courses.sharedCourseId), eq(cancellationHides.date, courseNotes.date))
		)
		.where(
			and(
				eq(courseNotes.kind, 'cancel'),
				gte(courseNotes.date, today),
				eq(courses.syncMode, 'synced'),
				inArray(courses.sharedCourseId, sharedCourseIds),
				eq(users.shareCancellations, true),
				isNull(users.suspendedAt),
				ne(users.id, viewerId),
				isNull(cancellationHides.sharedCourseId)
			)
		)
		.groupBy(courses.sharedCourseId, courseNotes.date)
		.all();
	return rows.flatMap((r) => (r.sharedCourseId && r.date ? [{ sharedCourseId: r.sharedCourseId, date: r.date, n: r.n }] : []));
}

const targetOf = (sharedCourseId: string, date: string) => `${sharedCourseId}|${date}`;
export const parseCancelTarget = (targetId: string) => {
	const [sharedCourseId, date] = targetId.split('|');
	return sharedCourseId && date ? { sharedCourseId, date } : null;
};

/** The days of this shared course this person has already reported */
export async function reportedDates(db: Db, reporterId: string, sharedCourseId: string) {
	const rows = await db
		.select({ targetId: reports.targetId })
		.from(reports)
		.where(and(eq(reports.reporterId, reporterId), eq(reports.targetType, 'shared_cancel'), eq(reports.status, 'open')))
		.all();
	return rows.flatMap((r) => {
		const t = parseCancelTarget(r.targetId);
		return t?.sharedCourseId === sharedCourseId ? [t.date] : [];
	});
}

/** One open report per person and day */
export async function reportCancellation(db: Db, reporterId: string, sharedCourseId: string, date: string) {
	const targetId = targetOf(sharedCourseId, date);
	const existing = await db
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.reporterId, reporterId),
				eq(reports.targetType, 'shared_cancel'),
				eq(reports.targetId, targetId),
				eq(reports.status, 'open')
			)
		)
		.get();
	if (existing) return;
	await db.insert(reports).values({ reporterId, targetType: 'shared_cancel', targetId, reason: CANCEL_REPORT_REASON });
}

/** For the admin: who marked this shared course's day as cancelled (10 at most) */
export async function cancelMarkers(db: Db, targetId: string) {
	const t = parseCancelTarget(targetId);
	if (!t) return [];
	return db
		.selectDistinct({ id: users.id, nickname: users.nickname })
		.from(courseNotes)
		.innerJoin(courses, eq(courseNotes.courseId, courses.id))
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.innerJoin(users, eq(timetables.userId, users.id))
		.where(
			and(
				eq(courseNotes.kind, 'cancel'),
				eq(courseNotes.date, t.date),
				eq(courses.sharedCourseId, t.sharedCourseId)
			)
		)
		.limit(10);
}

/** Takes the day down for everyone and closes the reports about it */
export async function hideCancellation(db: Db, targetId: string) {
	const t = parseCancelTarget(targetId);
	if (!t) return;
	await db.batch([
		db.insert(cancellationHides).values(t).onConflictDoNothing(),
		db
			.update(reports)
			.set({ status: 'closed' })
			.where(and(eq(reports.targetType, 'shared_cancel'), eq(reports.targetId, targetId)))
	]);
}
