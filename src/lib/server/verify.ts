import { and, count, eq, gt, inArray, lt } from 'drizzle-orm';
import { academicYear, tokyoTime } from '$lib/time';
import { normalizeEmail } from './auth/email';
import { generateToken, hashToken } from './auth/token';
import type { Db } from './db';
import { univVerifications, universities, users, verifyTokens } from './db/schema';
import { emailMatchesDomains } from './universities';

const TOKEN_LIFETIME = 24 * 60 * 60 * 1000;
const LIVE_TOKENS_MAX = 3;

// Good until May of the next academic year, so each spring students confirm they're still
// enrolled (some universities keep addresses after graduation).
export function verificationExpiry(now = Date.now()) {
	const year = academicYear(tokyoTime(now).date);
	return new Date(`${year + 1}-05-01T00:00:00+09:00`);
}

/** The address to check, or the message to show. */
export async function startVerification(db: Db, user: { id: string; universityId: string | null }, input: string) {
	const email = normalizeEmail(input);
	if (!email) return { message: 'メールアドレスを確かめてください' };
	if (!user.universityId) return { message: '先に「大学」を選んでください' };
	const university = await db.select().from(universities).where(eq(universities.id, user.universityId)).get();
	if (!university?.emailDomains.length) return { message: 'この大学はまだ在籍確認に対応していません' };
	if (!emailMatchesDomains(email, university.emailDomains)) {
		return { message: `${university.name}のメールアドレス（${university.emailDomains.map((d) => `@${d}`).join('・')}）を入れてください` };
	}

	const now = new Date();
	await db.delete(verifyTokens).where(lt(verifyTokens.expiresAt, now));
	const [live] = await db
		.select({ n: count() })
		.from(verifyTokens)
		.where(and(eq(verifyTokens.userId, user.id), gt(verifyTokens.expiresAt, now)));
	if ((live?.n ?? 0) >= LIVE_TOKENS_MAX) return { message: '確認のメールを送ったばかりです。届いたメールを確かめてください' };

	const token = generateToken();
	await db.insert(verifyTokens).values({
		id: await hashToken(token),
		userId: user.id,
		universityId: university.id,
		email,
		expiresAt: new Date(now.getTime() + TOKEN_LIFETIME)
	});
	return { token, email };
}

// Drops an unsent link so it doesn't count toward the limit.
export async function dropToken(db: Db, token: string) {
	await db.delete(verifyTokens).where(eq(verifyTokens.id, await hashToken(token)));
}

/** Uses the link: the account gets the check (moved from any other account with that address). */
export async function finishVerification(db: Db, token: string) {
	const id = await hashToken(token);
	const row = await db.select().from(verifyTokens).where(eq(verifyTokens.id, id)).get();
	if (!row) return null;
	if (row.expiresAt.getTime() <= Date.now()) {
		await db.delete(verifyTokens).where(eq(verifyTokens.id, id));
		return null;
	}
	const values = {
		userId: row.userId,
		universityId: row.universityId,
		email: row.email,
		verifiedAt: new Date(),
		expiresAt: verificationExpiry()
	};
	// The link is used up in the same batch, so if saving fails it still works. Two uses at
	// once both write the same check.
	await db.batch([
		db.delete(univVerifications).where(eq(univVerifications.email, row.email)),
		db
			.insert(univVerifications)
			.values(values)
			.onConflictDoUpdate({ target: univVerifications.userId, set: values }),
		db.delete(verifyTokens).where(eq(verifyTokens.id, id))
	]);
	const university = await db.select({ name: universities.name }).from(universities).where(eq(universities.id, row.universityId)).get();
	return { university: university?.name ?? '' };
}

export async function verificationOf(db: Db, userId: string) {
	return (
		(await db
			.select({
				email: univVerifications.email,
				expiresAt: univVerifications.expiresAt,
				university: universities.name,
				universityId: univVerifications.universityId
			})
			.from(univVerifications)
			.innerJoin(universities, eq(universities.id, univVerifications.universityId))
			.where(eq(univVerifications.userId, userId))
			.get()) ?? null
	);
}

/** Which of these people hold a current check for the university they have chosen */
export async function verifiedIds(db: Db, ids: string[]) {
	const out = new Set<string>();
	for (let i = 0; i < ids.length; i += 90) {
		const rows = await db
			.select({ id: univVerifications.userId })
			.from(univVerifications)
			.innerJoin(users, and(eq(users.id, univVerifications.userId), eq(users.universityId, univVerifications.universityId)))
			.where(and(inArray(univVerifications.userId, ids.slice(i, i + 90)), gt(univVerifications.expiresAt, new Date())));
		for (const r of rows) out.add(r.id);
	}
	return out;
}

/** Adds `verified` to each person */
export async function withVerified<T extends { id: string }>(db: Db, people: T[]) {
	const ids = await verifiedIds(
		db,
		people.map((p) => p.id)
	);
	return people.map((p) => ({ ...p, verified: ids.has(p.id) }));
}
