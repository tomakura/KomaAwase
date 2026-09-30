import type { Cookies } from '@sveltejs/kit';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { pushSubscriptions, sessions, timetables, users } from '$lib/server/db/schema';
import { generateToken, hashToken } from './token';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SESSION_LIFETIME = 30 * DAY;
// Extend the session when less than this much time is left.
const RENEW_THRESHOLD = 15 * DAY;

export const SESSION_COOKIE = 'session';

export type SessionUser = typeof users.$inferSelect;
// What pages need to know about the session itself
export type SessionInfo = { id: string; authedAt: Date | null };

export async function createSession(db: Db, userId: string, userAgent: string | null = null) {
	// Sessions that expire without being visited again are removed here.
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
	const token = generateToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_LIFETIME);
	await db.insert(sessions).values({
		id: await hashToken(token),
		userId,
		expiresAt,
		createdAt: now,
		lastUsedAt: now,
		authedAt: now,
		userAgent: userAgent?.slice(0, 400) || null
	});
	return { token, expiresAt };
}

/**
 * Signs this browser in as `userId`. A session it already had is ended: when it was the same
 * person's, the notifications it turned on move to the new one; someone else's stop.
 */
export async function signIn(db: Db, cookies: Cookies, request: Request, userId: string) {
	const previous = cookies.get(SESSION_COOKIE);
	const { token, expiresAt } = await createSession(db, userId, request.headers.get('user-agent'));
	if (previous) {
		const oldId = await hashToken(previous);
		const old = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, oldId)).get();
		if (old) {
			const subs =
				old.userId === userId
					? db.update(pushSubscriptions).set({ sessionId: await hashToken(token) }).where(eq(pushSubscriptions.sessionId, oldId))
					: db.delete(pushSubscriptions).where(eq(pushSubscriptions.sessionId, oldId));
			await db.batch([subs, db.delete(sessions).where(eq(sessions.id, oldId))]);
		}
	}
	setSessionCookie(cookies, token, expiresAt);
}

export type KnownTimetable = { id: string; year: number; universityId: string | null };

/**
 * The session's user, and with `year` their timetable for it (null when there is none yet),
 * read in the same query so a page that shows it waits for the database once less.
 */
export async function validateSession(db: Db, token: string, year: number | null = null) {
	const id = await hashToken(token);
	const row = await db
		.select({
			user: users,
			session: sessions,
			timetable: { id: timetables.id, year: timetables.year, universityId: timetables.universityId }
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.leftJoin(timetables, and(eq(timetables.userId, users.id), eq(timetables.year, year ?? 0)))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;
	// A suspended account has no sessions (suspendUser ends them); this stops one made since
	if (row.user.suspendedAt) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}

	const now = Date.now();
	if (row.session.expiresAt.getTime() <= now) {
		await endSessions(db, [id]);
		return null;
	}
	// One write at most an hour: renewing, and when it was last used (for ログイン中の端末)
	let expiresAt = row.session.expiresAt;
	const renew = expiresAt.getTime() - now < RENEW_THRESHOLD;
	if (renew) expiresAt = new Date(now + SESSION_LIFETIME);
	if (renew || !row.session.lastUsedAt || now - row.session.lastUsedAt.getTime() > HOUR) {
		await db.update(sessions).set({ expiresAt, lastUsedAt: new Date(now) }).where(eq(sessions.id, id));
	}
	return {
		user: row.user,
		session: { id, authedAt: row.session.authedAt } satisfies SessionInfo,
		timetable: year === null ? undefined : row.timetable,
		expiresAt
	};
}

/** Ends these sessions (by id) along with the notifications their devices turned on */
export async function endSessions(db: Db, ids: string[]) {
	if (!ids.length) return;
	await db.batch([
		db.delete(pushSubscriptions).where(inArray(pushSubscriptions.sessionId, ids)),
		db.delete(sessions).where(inArray(sessions.id, ids))
	]);
}

/** Logs out every other device of this person; how many there were */
export async function endOtherSessions(db: Db, userId: string, currentId: string | undefined) {
	const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
	const ids = rows.map((r) => r.id).filter((id) => id !== currentId);
	await endSessions(db, ids);
	return ids.length;
}

export async function deleteSession(db: Db, token: string) {
	await endSessions(db, [await hashToken(token)]);
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', expires: expiresAt });
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
