import type { Cookies } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { sessions, timetables, users } from '$lib/server/db/schema';
import { generateToken, hashToken } from './token';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME = 30 * DAY;
// Extend the session when less than this much time is left.
const RENEW_THRESHOLD = 15 * DAY;

export const SESSION_COOKIE = 'session';

export type SessionUser = typeof users.$inferSelect;

export async function createSession(db: Db, userId: string) {
	// Sessions that expire without being visited again are removed here.
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
	const token = generateToken();
	const expiresAt = new Date(Date.now() + SESSION_LIFETIME);
	await db.insert(sessions).values({ id: await hashToken(token), userId, expiresAt });
	return { token, expiresAt };
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
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	let expiresAt = row.session.expiresAt;
	if (expiresAt.getTime() - now < RENEW_THRESHOLD) {
		expiresAt = new Date(now + SESSION_LIFETIME);
		await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
	}
	return { user: row.user, timetable: year === null ? undefined : row.timetable, expiresAt };
}

export async function deleteSession(db: Db, token: string) {
	await db.delete(sessions).where(eq(sessions.id, await hashToken(token)));
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', expires: expiresAt });
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
