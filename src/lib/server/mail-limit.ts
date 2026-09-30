import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { MAIL_COOLDOWN_SECONDS } from '$lib/mail';
import type { Db } from './db';
import { rateCounts } from './db/schema';

// The rental server's mail is stopped when it sends much more than 1,500 an hour or 15,000 a
// day, which would stop everyone's sign-in mail. The app stays at a third of that, all users
// together; past it, people who have a passkey still sign in.
export const MAIL_HOURLY_MAX = 500;
export const MAIL_DAILY_MAX = 5000;
// Between two mails to the same address
export const MAIL_COOLDOWN_MS = MAIL_COOLDOWN_SECONDS * 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const JST = 9 * HOUR;

export const MAIL_LIMIT_MESSAGES = {
	hour: 'メールの送信が、アプリ全体の上限に達しました。1時間ほどたってから、もう一度送ってください。',
	day: '今日のメールの送信は、アプリ全体の上限に達しました。明日、もう一度送ってください。'
} as const;
export const MAIL_COOLDOWN_MESSAGE =
	'このアドレスには、少し前にメールを送信しました。もう一度送れるのは60秒後です。届いたメールを確かめてください。';

/** The counters a mail sent at `now` goes into: this hour, and this day in Japan */
export function mailWindows(now: number) {
	const hour = Math.floor(now / HOUR);
	const day = Math.floor((now + JST) / DAY);
	return {
		hour: { key: `mail:h:${hour}`, max: MAIL_HOURLY_MAX, expiresAt: new Date((hour + 1) * HOUR) },
		day: { key: `mail:d:${day}`, max: MAIL_DAILY_MAX, expiresAt: new Date((day + 1) * DAY - JST) }
	};
}

// Adds one unless the count is at `max`; true when it was added
async function take(db: Db, w: { key: string; max: number; expiresAt: Date }) {
	const row = await db
		.insert(rateCounts)
		.values({ key: w.key, n: 1, expiresAt: w.expiresAt })
		.onConflictDoUpdate({ target: rateCounts.key, set: { n: sql`${rateCounts.n} + 1` }, setWhere: lt(rateCounts.n, w.max) })
		.returning({ n: rateCounts.n })
		.get();
	return !!row;
}

/**
 * Counts one mail against the app-wide limits. 'hour' or 'day' when that limit is reached, and
 * then nothing is counted: a flood held back by the hourly limit doesn't use up the day.
 */
export async function takeMailBudget(db: Db, now = Date.now()): Promise<'ok' | 'hour' | 'day'> {
	const w = mailWindows(now);
	if (!(await take(db, w.hour))) return 'hour';
	if (await take(db, w.day)) return 'ok';
	await db
		.update(rateCounts)
		.set({ n: sql`${rateCounts.n} - 1` })
		.where(and(eq(rateCounts.key, w.hour.key), gt(rateCounts.n, 0)));
	return 'day';
}

/** Drops counters whose time is over (the daily cron) */
export async function sweepRateCounts(db: Db, now = Date.now()) {
	await db.delete(rateCounts).where(lt(rateCounts.expiresAt, new Date(now)));
}
