import { and, count, eq, gt, inArray, isNull, lt, max, ne, or, sql } from 'drizzle-orm';
import { academicYear, tokyoTime } from '$lib/time';
import type { RequestEvent } from '@sveltejs/kit';
import { normalizeEmail, sendRelayMail } from './auth/email';
import { rememberVerifyNext } from './auth/next';
import { MAIL_COOLDOWN_MESSAGE, MAIL_COOLDOWN_MS, MAIL_LIMIT_MESSAGES, takeMailBudget } from './mail-limit';
import { RATE_LIMITED_MESSAGE, isRateLimited } from './rate-limit';
import { generateToken, hashToken } from './auth/token';
import type { Db } from './db';
import { univVerifications, universities, users, verifyTokens } from './db/schema';
import { emailMatchesDomains } from './universities';
import { STAGE_LAPSED, STAGE_NEED, verifyPrompt } from '$lib/verify-prompt';

const TOKEN_LIFETIME = 24 * 60 * 60 * 1000;
const LIVE_TOKENS_MAX = 3;

// Good until May of the next academic year, so each spring students confirm they're still
// enrolled (some universities keep addresses after graduation).
export function verificationExpiry(now = Date.now()) {
	const year = academicYear(tokyoTime(now).date);
	return new Date(`${year + 1}-05-01T00:00:00+09:00`);
}

/**
 * The mailbox an address reaches: without a +tag (taro+koma@u.ac.jp is taro@u.ac.jp), since
 * university mail (Google Workspace, Microsoft 365) delivers those to the same inbox. One
 * mailbox confirms one account. Subdomains stay apart. The mail still goes to the address as
 * typed, and that is the address the check keeps and shows. Same as the backfill in 0030.
 */
export function mailboxOf(email: string) {
	const at = email.indexOf('@');
	const plus = email.indexOf('+');
	return plus > 0 && plus < at ? email.slice(0, plus) + email.slice(at) : email;
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
	const [[live], [latest]] = await db.batch([
		db
			.select({ n: count() })
			.from(verifyTokens)
			.where(and(eq(verifyTokens.userId, user.id), gt(verifyTokens.expiresAt, now))),
		// The newest link to this address, from anyone: nearly all its time left means it just went
		db.select({ at: max(verifyTokens.expiresAt) }).from(verifyTokens).where(eq(verifyTokens.email, email))
	]);
	if (latest?.at && latest.at.getTime() > now.getTime() + TOKEN_LIFETIME - MAIL_COOLDOWN_MS) return { message: MAIL_COOLDOWN_MESSAGE };
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

// mailboxOf in SQL, for checks from before 0030 that were left without their mailbox (it is
// held by another account's check, which may since have gone)
const e = univVerifications.email;
const mailboxOfStored = sql`CASE WHEN instr(substr(${e}, 1, instr(${e}, '@') - 1), '+') > 1 THEN substr(${e}, 1, instr(${e}, '+') - 1) || substr(${e}, instr(${e}, '@')) ELSE ${e} END`;

/**
 * Another account's check on the address or another address of its mailbox. A check left
 * without its mailbox counts too, so that a third account can't take the mailbox once its
 * holder is gone; but not against the account that holds the mailbox itself, which keeps it.
 * The unique indexes stand behind all but those left without one.
 */
async function heldByOther(db: Db, email: string, userId: string) {
	const mailbox = mailboxOf(email);
	const other = ne(univVerifications.userId, userId);
	const held = await db
		.select({ userId: univVerifications.userId })
		.from(univVerifications)
		.where(and(or(eq(univVerifications.email, email), eq(univVerifications.mailbox, mailbox)), other))
		.get();
	if (held) return held;
	const left = await db
		.select({ userId: univVerifications.userId })
		.from(univVerifications)
		.where(and(isNull(univVerifications.mailbox), eq(mailboxOfStored, mailbox), other))
		.get();
	if (!left) return undefined;
	const own = await db
		.select({ userId: univVerifications.userId })
		.from(univVerifications)
		.where(and(eq(univVerifications.userId, userId), eq(univVerifications.mailbox, mailbox)))
		.get();
	return own ? undefined : left;
}

/**
 * What an enrollment link is for, while it works: whose account, which university and
 * address, and whether that address (or its mailbox) already confirms someone else's account.
 */
export async function peekVerification(db: Db, token: string) {
	const row = await db
		.select({
			userId: verifyTokens.userId,
			email: verifyTokens.email,
			expiresAt: verifyTokens.expiresAt,
			university: universities.name,
			nickname: users.nickname
		})
		.from(verifyTokens)
		.innerJoin(users, eq(users.id, verifyTokens.userId))
		.leftJoin(universities, eq(universities.id, verifyTokens.universityId))
		.where(eq(verifyTokens.id, await hashToken(token)))
		.get();
	if (!row || row.expiresAt.getTime() <= Date.now()) return null;
	const other = await heldByOther(db, row.email, row.userId);
	return { userId: row.userId, email: row.email, university: row.university ?? '', nickname: row.nickname, taken: !!other };
}

/**
 * Uses the link, for the account that asked for it only. An address that confirms another
 * account, or another address of its mailbox, is refused ('taken'): the check never moves
 * between accounts, so a link that reached the wrong hands can't take it over.
 */
export async function finishVerification(db: Db, token: string, userId: string) {
	const id = await hashToken(token);
	const row = await db.select().from(verifyTokens).where(eq(verifyTokens.id, id)).get();
	if (!row) return null;
	if (row.expiresAt.getTime() <= Date.now()) {
		await db.delete(verifyTokens).where(eq(verifyTokens.id, id));
		return null;
	}
	if (row.userId !== userId) return 'other-account' as const;
	if (await heldByOther(db, row.email, row.userId)) return 'taken' as const;
	const values = {
		userId: row.userId,
		universityId: row.universityId,
		email: row.email,
		mailbox: mailboxOf(row.email),
		verifiedAt: new Date(),
		expiresAt: verificationExpiry()
	};
	// The link is used up in the same batch, so if saving fails it still works. The address
	// and its mailbox are unique: when another account holds either, the insert fails and
	// nothing changes.
	try {
		await db.batch([
			db
				.insert(univVerifications)
				.values(values)
				.onConflictDoUpdate({ target: univVerifications.userId, set: values }),
			db.delete(verifyTokens).where(eq(verifyTokens.id, id)),
			// The reminders start over for the new check
			db.update(users).set({ verifyPromptStage: null }).where(eq(users.id, row.userId))
		]);
	} catch (e) {
		if (await heldByOther(db, row.email, row.userId)) return 'taken' as const;
		throw e;
	}
	const university = await db.select({ name: universities.name }).from(universities).where(eq(universities.id, row.universityId)).get();
	return { university: university?.name ?? '' };
}

// How long a Google sign-in counts for verifyByGoogle: enough for the nickname, the passkey and
// はじめの設定 that come after a first sign-in
const GOOGLE_FRESH_MS = 60 * 60 * 1000;

/**
 * Confirms enrollment without a mail, for someone who signed in with Google using an address
 * of their university: Google has just vouched that they hold it (only Workspace and Gmail
 * accounts sign in, see google.ts). False when it doesn't apply, or the address already
 * confirms another account; then the mail is offered as usual.
 */
export async function verifyByGoogle(
	db: Db,
	user: { id: string; email: string; googleSub: string | null; googleAt: Date | null },
	university: { id: string; emailDomains: string[] }
) {
	if (!user.googleSub || !emailMatchesDomains(user.email, university.emailDomains)) return false;
	// Only a recent Google sign-in speaks for the address now: one from long ago (say, before
	// the school deleted the account) would renew the check every time はじめの設定 is sent
	if (!user.googleAt || Date.now() - user.googleAt.getTime() > GOOGLE_FRESH_MS) return false;
	if (await heldByOther(db, user.email, user.id)) return false;
	const values = {
		userId: user.id,
		universityId: university.id,
		email: user.email,
		mailbox: mailboxOf(user.email),
		verifiedAt: new Date(),
		expiresAt: verificationExpiry()
	};
	try {
		await db.batch([
			db.insert(univVerifications).values(values).onConflictDoUpdate({ target: univVerifications.userId, set: values }),
			db.update(users).set({ verifyPromptStage: null }).where(eq(users.id, user.id))
		]);
	} catch (e) {
		// The address and its mailbox are unique: another account holds one of them
		console.error('enrollment check from Google sign-in failed', e);
		return false;
	}
	return true;
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

/**
 * What verifiedIds tells, as a column of a query that reads `users`, so it comes without a
 * trip to D1 of its own
 */
export const verifiedColumn = () =>
	sql<boolean>`exists (select 1 from "univ_verifications" where "univ_verifications"."user_id" = "users"."id" and "univ_verifications"."university_id" = "users"."university_id" and "univ_verifications"."expires_at" > ${Date.now()})`.mapWith(
		Boolean
	);

/**
 * Whether this person may use what is shared at their university (searching its courses,
 * reading the みんなの授業データ, importing from a screenshot, adding to it): they hold a
 * current enrollment check for it, or run the app. Otherwise why not, for what to tell them.
 */
export type SharedAccess = 'ok' | 'need-verify' | 'unsupported' | 'no-university';

export async function sharedAccess(db: Db, userId: string, universityId: string | null): Promise<SharedAccess> {
	if (!universityId) return 'no-university';
	const [[user], [university], [check]] = await db.batch([
		db.select({ role: users.role }).from(users).where(eq(users.id, userId)),
		db.select({ domains: universities.emailDomains }).from(universities).where(eq(universities.id, universityId)),
		db
			.select({ userId: univVerifications.userId })
			.from(univVerifications)
			.where(
				and(
					eq(univVerifications.userId, userId),
					eq(univVerifications.universityId, universityId),
					gt(univVerifications.expiresAt, new Date())
				)
			)
	]);
	if (user?.role === 'admin' || check) return 'ok';
	return university?.domains.length ? 'need-verify' : 'unsupported';
}

/** The screen to suggest an enrollment check on, if one is due (see verify-prompt.ts) */
export async function verifyPromptFor(
	db: Db,
	user: { id: string; universityId: string | null; setupAt: Date | null; verifyPromptStage: number | null }
) {
	if (!user.setupAt || !user.universityId) return null;
	const row = await db
		.select({ domains: universities.emailDomains, expiresAt: univVerifications.expiresAt })
		.from(universities)
		.leftJoin(univVerifications, and(eq(univVerifications.universityId, universities.id), eq(univVerifications.userId, user.id)))
		.where(eq(universities.id, user.universityId))
		.get();
	if (!row) return null;
	return verifyPrompt({
		supported: row.domains.length > 0,
		check: row.expiresAt ? { expiresAt: row.expiresAt.getTime() } : null,
		shown: user.verifyPromptStage,
		now: Date.now()
	});
}

/** Remembers that the prompt for `stage` was shown; earlier stages don't come back. */
export async function markVerifyPrompt(db: Db, userId: string, stage: number) {
	if (![STAGE_NEED, 30, 14, 7, STAGE_LAPSED].includes(stage)) return;
	await db
		.update(users)
		.set({ verifyPromptStage: stage })
		.where(and(eq(users.id, userId), or(isNull(users.verifyPromptStage), gt(users.verifyPromptStage, stage))));
}

/**
 * The enrollment mail for the form that was posted: `sentTo`, or the message and status to show.
 * The form's `next` is where the link goes on to once opened (see rememberVerifyNext).
 */
export async function sendVerificationMail(
	event: RequestEvent
): Promise<{ sentTo: string } | { status: number; message: string; email: string }> {
	const { locals, request, url, platform, cookies } = event;
	const form = await request.formData();
	const input = String(form.get('email') ?? '');
	if (!locals.user || !platform) return { status: 500, message: 'もう一度やり直してください', email: input };
	if (await isRateLimited(event, platform.env.EMAIL_LINK_LIMITER)) return { status: 429, message: RATE_LIMITED_MESSAGE, email: input };

	const started = await startVerification(locals.db, locals.user, input);
	if (!started.token) return { status: 400, message: started.message ?? 'もう一度やり直してください', email: input };
	// All users together, so the rental server keeps sending
	const budget = await takeMailBudget(locals.db);
	if (budget !== 'ok') {
		await dropToken(locals.db, started.token);
		return { status: 503, message: MAIL_LIMIT_MESSAGES[budget], email: input };
	}
	try {
		await sendRelayMail(platform.env, 'verify', started.email, `${url.origin}/verify/${started.token}`);
	} catch (e) {
		console.error('verification mail failed', e);
		await dropToken(locals.db, started.token);
		return { status: 502, message: 'メールを送れませんでした。時間をおいてもう一度やり直してください', email: input };
	}
	rememberVerifyNext(cookies, String(form.get('next') ?? ''));
	return { sentTo: started.email };
}
