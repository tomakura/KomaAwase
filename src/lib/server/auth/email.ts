import { dev } from '$app/environment';
import { and, count, eq, gt, lt, max } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { emailTokens } from '$lib/server/db/schema';
import { hmacSha256Hex, newNonce } from '$lib/server/hmac';
import { MAIL_COOLDOWN_MS } from '$lib/server/mail-limit';
import { generateToken, hashToken } from './token';

const TOKEN_LIFETIME = 15 * 60 * 1000;
// At most this many live links per address, so one address can't be mail-bombed.
const MAX_LIVE_TOKENS_PER_EMAIL = 3;

export function normalizeEmail(input: string): string | null {
	const email = input.trim().toLowerCase();
	// Deliberately loose: the sign-in link proves the address works.
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * A new sign-in link for the address, unless one went to it less than a minute ago
 * ('cooldown') or it already has too many unused ones ('many').
 */
export async function createEmailToken(db: Db, email: string): Promise<{ token: string } | { error: 'cooldown' | 'many' }> {
	const now = Date.now();
	await db.delete(emailTokens).where(lt(emailTokens.expiresAt, new Date(now)));
	const live = await db
		.select({ n: count(), latest: max(emailTokens.expiresAt) })
		.from(emailTokens)
		.where(and(eq(emailTokens.email, email), gt(emailTokens.expiresAt, new Date(now))))
		.get();
	// The newest link was made less than a minute ago when it has nearly all its time left
	if (live?.latest && live.latest.getTime() > now + TOKEN_LIFETIME - MAIL_COOLDOWN_MS) return { error: 'cooldown' };
	if ((live?.n ?? 0) >= MAX_LIVE_TOKENS_PER_EMAIL) return { error: 'many' };

	const token = generateToken();
	await db.insert(emailTokens).values({
		id: await hashToken(token),
		email,
		expiresAt: new Date(now + TOKEN_LIFETIME)
	});
	return { token };
}

/** The address of a link that still works, without using it up (for showing it) */
export async function peekEmailToken(db: Db, token: string): Promise<string | null> {
	const row = await db
		.select({ email: emailTokens.email })
		.from(emailTokens)
		.where(and(eq(emailTokens.id, await hashToken(token)), gt(emailTokens.expiresAt, new Date())))
		.get();
	return row?.email ?? null;
}

/** Returns the email for a valid token and deletes it so the link works once. */
export async function consumeEmailToken(db: Db, token: string): Promise<string | null> {
	const id = await hashToken(token);
	const row = await db.delete(emailTokens).where(eq(emailTokens.id, id)).returning().get();
	if (!row || row.expiresAt.getTime() <= Date.now()) return null;
	return row.email;
}

/**
 * Sends a message through the relay on the rental server (relay/send.php). Workers can't
 * reach its SMTP ports, so the relay sends from the server itself. It only knows fixed
 * messages: `kind` picks one, and the link must be the app's own page for it.
 */
export async function sendRelayMail(env: Env, kind: 'signin' | 'verify', to: string, link: string) {
	if (dev) {
		console.log(`[dev] ${kind} link for ${to}: ${link}`);
		return;
	}
	if (!env.RELAY_URL || !env.RELAY_SECRET) throw new Error('Mail relay is not configured');

	const body = JSON.stringify({ to, link, kind });
	const timestamp = String(Math.floor(Date.now() / 1000));
	const nonce = newNonce();
	const res = await fetch(env.RELAY_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-koma-timestamp': timestamp,
			'x-koma-nonce': nonce,
			'x-koma-signature': await hmacSha256Hex(env.RELAY_SECRET, `${timestamp}.${nonce}.${body}`)
		},
		body,
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Mail relay responded ${res.status}: ${await res.text()}`);
}

export const sendSignInEmail = (env: Env, to: string, link: string) => sendRelayMail(env, 'signin', to, link);
