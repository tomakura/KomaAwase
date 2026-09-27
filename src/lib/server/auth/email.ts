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

export async function sendSignInEmail(to: string, link: string) {
	// The mail provider is not decided yet (docs/README.md). In dev the link goes to the console.
	if (dev) {
		console.log(`[dev] sign-in link for ${to}: ${link}`);
		return;
	}
	throw new Error('Email sending is not configured');
}
