import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { emailTokens } from '$lib/server/db/schema';
import { generateToken, hashToken } from './token';

const TOKEN_LIFETIME = 15 * 60 * 1000;

export function normalizeEmail(input: string): string | null {
	const email = input.trim().toLowerCase();
	// Deliberately loose: the sign-in link proves the address works.
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function createEmailToken(db: Db, email: string) {
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
