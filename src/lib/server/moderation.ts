import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from './db';
import { pushSubscriptions, reports, sessions, universities, userPhotos, users, warnings } from './db/schema';
import { removePhoto } from './photos';
import { verifiedIds } from './verify';

const PAGE = 30;
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** People, newest first, or those matching a nickname or an address */
export async function listUsers(db: Db, q: string, page: number) {
	const term = q.trim();
	const match = term
		? or(
				sql`${users.nickname} like ${likePattern(term)} escape '\\'`,
				sql`${users.email} like ${likePattern(term)} escape '\\'`
			)
		: undefined;
	const [rows, [total]] = await db.batch([
		db
			.select({
				id: users.id,
				nickname: users.nickname,
				email: users.email,
				university: universities.name,
				createdAt: users.createdAt,
				lastSeenAt: lastSeenAt,
				suspendedAt: users.suspendedAt,
				reported: sql<number>`(select count(*) from ${reports} where ${reports.targetType} = 'user' and ${reports.targetId} = ${users.id})`
			})
			.from(users)
			.leftJoin(universities, eq(universities.id, users.universityId))
			.where(match)
			.orderBy(desc(users.createdAt), desc(users.id))
			.limit(PAGE)
			.offset((page - 1) * PAGE),
		db.select({ n: count() }).from(users).where(match)
	]);
	const verified = await verifiedIds(db, rows.map((r) => r.id));
	return { users: rows.map((r) => ({ ...r, verified: verified.has(r.id) })), total: total?.n ?? 0, pageSize: PAGE };
}

// When they last opened the app: the latest use of any of their sign-ins (kept by the session
// check at most once an hour). Someone signed out everywhere has none.
const lastSeenAt = sql<Date | null>`(select max(${sessions.lastUsedAt}) from ${sessions} where ${sessions.userId} = ${users.id})`.mapWith(
	(v) => (v == null ? null : new Date(Number(v)))
);

export async function loadUser(db: Db, userId: string) {
	const user = await db
		.select({
			id: users.id,
			nickname: users.nickname,
			email: users.email,
			university: universities.name,
			createdAt: users.createdAt,
			lastSeenAt: lastSeenAt,
			suspendedAt: users.suspendedAt,
			hasPhoto: sql<number>`exists (select 1 from ${userPhotos} where ${userPhotos.userId} = ${users.id})`
		})
		.from(users)
		.leftJoin(universities, eq(universities.id, users.universityId))
		.where(eq(users.id, userId))
		.get();
	if (!user) return null;
	const [[reported], sent, verified] = await Promise.all([
		db
			.select({ n: count() })
			.from(reports)
			.where(and(eq(reports.targetType, 'user'), eq(reports.targetId, userId))),
		db.select().from(warnings).where(eq(warnings.userId, userId)).orderBy(desc(warnings.createdAt)),
		verifiedIds(db, [userId])
	]);
	return { ...user, hasPhoto: !!user.hasPhoto, reported: reported?.n ?? 0, verified: verified.has(userId), warnings: sent };
}

export async function sendWarning(db: Db, adminId: string, userId: string, body: string) {
	await db.insert(warnings).values({ userId, body, sentBy: adminId });
}

/** The oldest warning this person hasn't pressed 理解しました on, for the full-screen notice */
export function pendingWarning(db: Db, userId: string) {
	return db
		.select({ id: warnings.id, body: warnings.body })
		.from(warnings)
		.where(and(eq(warnings.userId, userId), isNull(warnings.acknowledgedAt)))
		.orderBy(asc(warnings.createdAt), asc(warnings.id))
		.get();
}

export async function acknowledgeWarning(db: Db, userId: string, warningId: string) {
	await db
		.update(warnings)
		.set({ acknowledgedAt: new Date() })
		.where(and(eq(warnings.id, warningId), eq(warnings.userId, userId), isNull(warnings.acknowledgedAt)));
}

/** Stops the account: signed out everywhere, no notifications, and the login refuses it */
export async function suspendUser(db: Db, userId: string) {
	await db.batch([
		db.update(users).set({ suspendedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.suspendedAt))),
		db.delete(sessions).where(eq(sessions.userId, userId)),
		db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
	]);
}

export async function resumeUser(db: Db, userId: string) {
	await db.update(users).set({ suspendedAt: null }).where(eq(users.id, userId));
}

/** The nickname goes, so the person is asked for a new one when they next open the app */
export async function resetNickname(db: Db, userId: string) {
	await db.update(users).set({ nickname: null }).where(eq(users.id, userId));
}

export async function deletePhoto(db: Db, user: { id: string; nickname: string | null; icon: typeof users.$inferSelect.icon }) {
	await removePhoto(db, user);
}

/** Whether these people are suspended, for leaving them out of what others see */
export async function suspendedIds(db: Db, ids: string[]) {
	const out = new Set<string>();
	for (let i = 0; i < ids.length; i += 90) {
		const rows = await db
			.select({ id: users.id })
			.from(users)
			.where(and(inArray(users.id, ids.slice(i, i + 90)), isNotNull(users.suspendedAt)));
		for (const r of rows) out.add(r.id);
	}
	return out;
}
