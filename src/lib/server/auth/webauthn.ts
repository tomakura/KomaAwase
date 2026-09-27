import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { authChallenges } from '$lib/server/db/schema';

export const RP_NAME = 'コマあわせ';

const CHALLENGE_COOKIE = 'webauthn_challenge';
const CHALLENGE_LIFETIME = 5 * 60 * 1000;

/** The relying party is whatever host serves the app (localhost in dev). */
export function relyingParty(url: URL) {
	return { rpID: url.hostname, origin: url.origin };
}

export async function saveChallenge(db: Db, cookies: Cookies, challenge: string, userId: string | null) {
	const row = await db
		.insert(authChallenges)
		.values({ challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME) })
		.returning({ id: authChallenges.id })
		.get();
	cookies.set(CHALLENGE_COOKIE, row.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: CHALLENGE_LIFETIME / 1000
	});
}

/** Single use: the challenge is deleted as it is read. */
export async function takeChallenge(db: Db, cookies: Cookies) {
	const id = cookies.get(CHALLENGE_COOKIE);
	if (!id) return null;
	cookies.delete(CHALLENGE_COOKIE, { path: '/' });
	const row = await db.delete(authChallenges).where(eq(authChallenges.id, id)).returning().get();
	if (!row || row.expiresAt.getTime() <= Date.now()) return null;
	return row;
}
