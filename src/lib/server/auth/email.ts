import { dev } from '$app/environment';
import { and, count, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { emailTokens } from '$lib/server/db/schema';
import { generateToken, hashToken } from './token';

const TOKEN_LIFETIME = 15 * 60 * 1000;
// At most this many live links per address, so one address can't be mail-bombed.
const MAX_LIVE_TOKENS_PER_EMAIL = 3;

export function normalizeEmail(input: string): string | null {
	const email = input.trim().toLowerCase();
	// Deliberately loose: the sign-in link proves the address works.
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Returns null when the address already has too many unused links. */
export async function createEmailToken(db: Db, email: string): Promise<string | null> {
	const now = new Date();
	await db.delete(emailTokens).where(lt(emailTokens.expiresAt, now));
	const live = await db
		.select({ n: count() })
		.from(emailTokens)
		.where(and(eq(emailTokens.email, email), gt(emailTokens.expiresAt, now)))
		.get();
	if ((live?.n ?? 0) >= MAX_LIVE_TOKENS_PER_EMAIL) return null;

	const token = generateToken();
	await db.insert(emailTokens).values({
		id: await hashToken(token),
		email,
		expiresAt: new Date(Date.now() + TOKEN_LIFETIME)
	});
	return token;
}

/** Returns the email for a valid token and deletes it so the link works once. */
export async function consumeEmailToken(db: Db, token: string): Promise<string | null> {
	const id = await hashToken(token);
	const row = await db.delete(emailTokens).where(eq(emailTokens.id, id)).returning().get();
	if (!row || row.expiresAt.getTime() <= Date.now()) return null;
	return row.email;
}

/**
 * Sends the sign-in link through the relay on the rental server (relay/send.php).
 * Workers can't reach its SMTP ports, so the relay sends from the server itself.
 */
export async function sendSignInEmail(env: Env, to: string, link: string) {
	if (dev) {
		console.log(`[dev] sign-in link for ${to}: ${link}`);
		return;
	}
	if (!env.RELAY_URL || !env.RELAY_SECRET) throw new Error('Mail relay is not configured');

	const body = JSON.stringify({ to, link });
	const timestamp = String(Math.floor(Date.now() / 1000));
	const res = await fetch(env.RELAY_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-koma-timestamp': timestamp,
			'x-koma-signature': await hmacSha256Hex(env.RELAY_SECRET, `${timestamp}.${body}`)
		},
		body,
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Mail relay responded ${res.status}: ${await res.text()}`);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
	return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
