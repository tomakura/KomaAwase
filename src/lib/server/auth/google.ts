import { Google, decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

// Google sign-in. It shows up once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, with
// https://<host>/login/google/callback registered as the redirect URI.
export function googleEnabled(env: Env | undefined) {
	return !!env?.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

const client = (env: Env, origin: string) =>
	new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, `${origin}/login/google/callback`);

const STATE_COOKIE = 'google_state';
const VERIFIER_COOKIE = 'google_verifier';
// Lax, since Google sends the browser back with a top-level GET
const cookie = { path: '/login/google', httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 } as const;

export function startGoogle(env: Env, origin: string, cookies: Cookies) {
	const state = generateState();
	const verifier = generateCodeVerifier();
	cookies.set(STATE_COOKIE, state, cookie);
	cookies.set(VERIFIER_COOKIE, verifier, cookie);
	return client(env, origin).createAuthorizationURL(state, verifier, ['openid', 'email']);
}

/**
 * The Google account coming back from sign-in: its stable id and verified address. Null when
 * the request doesn't match the one we started, or Google didn't confirm the address.
 */
export async function finishGoogle(env: Env, url: URL, cookies: Cookies) {
	const state = cookies.get(STATE_COOKIE);
	const verifier = cookies.get(VERIFIER_COOKIE);
	cookies.delete(STATE_COOKIE, { path: cookie.path });
	cookies.delete(VERIFIER_COOKIE, { path: cookie.path });
	const code = url.searchParams.get('code');
	if (!state || !verifier || !code || url.searchParams.get('state') !== state) return null;

	const tokens = await client(env, url.origin).validateAuthorizationCode(code, verifier);
	// Straight from Google's token endpoint over TLS, so the signature needn't be checked here.
	const claims = decodeIdToken(tokens.idToken()) as { sub?: string; email?: string; email_verified?: boolean; hd?: string };
	if (!claims.sub || !claims.email || claims.email_verified !== true) return null;
	return { sub: claims.sub, email: claims.email.toLowerCase(), hd: claims.hd ?? null };
}

// Google speaks for who holds an address now only for Gmail and Workspace (hd) accounts. Any
// other Google account was made with an address that may have changed hands since.
function ownsAddress(account: { email: string; hd: string | null }) {
	return account.email.endsWith('@gmail.com') || !!account.hd;
}

/**
 * The account for a Google sign-in: known by its Google id, else by its address (then
 * linked), else new. 'use-mail' when the address can't be trusted to find or make one.
 */
export async function userForGoogle(db: Db, account: { sub: string; email: string; hd: string | null }) {
	const bySub = await db.select().from(users).where(eq(users.googleSub, account.sub)).get();
	if (bySub) return bySub;
	if (!ownsAddress(account)) return 'use-mail' as const;
	const byEmail = await db.select().from(users).where(eq(users.email, account.email)).get();
	if (byEmail) {
		// The address was proven both ways, by Google and by the sign-in mail.
		if (!byEmail.googleSub) await db.update(users).set({ googleSub: account.sub }).where(eq(users.id, byEmail.id));
		return byEmail;
	}
	await db.insert(users).values({ email: account.email, googleSub: account.sub }).onConflictDoNothing();
	return (await db.select().from(users).where(eq(users.googleSub, account.sub)).get()) ?? null;
}
