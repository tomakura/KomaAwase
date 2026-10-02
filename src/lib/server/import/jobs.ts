import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { readImport } from '$lib/import';
import { RETRY_AFTER_RESET, TOTAL_DAILY_LIMIT, lastQuotaReset, nextRetryTime } from '$lib/import-quota';
import type { Db } from '../db';
import { authChallenges, emailTokens, importJobs, sessions } from '../db/schema';
import { notify } from '../notify';
import { Busy, OutOfQuota, readWithGroq, readWithWorkersAi } from './providers';

// The free tiers read about 110 screenshots a day between them: each person gets a few, and
// everyone together TOTAL_DAILY_LIMIT (import-quota.ts).
export const DAILY_LIMIT = 5;
const ACTIVE_LIMIT = 2;
const ATTEMPTS_MAX = 3;
const KEEP_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

// A cropped JPEG, as the page sends it. D1 rows hold up to 2MB.
const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
export const IMAGE_MAX = 1_500_000;

// Jobs that count toward today's free quota (quotaUsed)
const spokenFor = () =>
	or(
		inArray(importJobs.status, ['queued', 'processing']),
		and(eq(importJobs.status, 'retry'), lt(importJobs.retryAt, new Date(lastQuotaReset().getTime() + DAY))),
		and(
			or(eq(importJobs.status, 'done'), and(eq(importJobs.status, 'failed'), gt(importJobs.attempts, 0))),
			gte(importJobs.finishedAt, lastQuotaReset())
		)
	);

/**
 * How much of today's free quota is spoken for: screenshots waiting or being read, those put
 * off to a time before the next reset (they come back to the queue then), and those read
 * since the quotas last reset.
 */
export async function quotaUsed(db: Db) {
	const [row] = await db.select({ n: count() }).from(importJobs).where(spokenFor());
	return row?.n ?? 0;
}

/**
 * When a screenshot that can't be read today would be read: the next morning, or the one
 * after when the queue for that morning already holds a day's worth. Never later than that:
 * a job is given up after three days (dailySweep). Null when both mornings are full.
 */
export async function readSlot(db: Db) {
	let at = nextRetryTime();
	for (let day = 0; day < 2; day++) {
		const from = new Date(at.getTime() - RETRY_AFTER_RESET);
		const [row] = await db
			.select({ n: count() })
			.from(importJobs)
			.where(and(eq(importJobs.status, 'retry'), gte(importJobs.retryAt, from), lt(importJobs.retryAt, new Date(from.getTime() + DAY))));
		if ((row?.n ?? 0) < TOTAL_DAILY_LIMIT) return at;
		at = new Date(at.getTime() + DAY);
	}
	return null;
}

/**
 * Saves a screenshot to be read. `deferred` when the day's total is used up: it isn't sent to
 * the queue, and is read after the quotas reset (see nextRetryTime). The limits are checked
 * and the job saved in one statement, so screenshots sent at the same moment can't pass a
 * limit together; the checks before it only find the message to show.
 */
export async function createImportJob(
	db: Db,
	userId: string,
	timetableId: string,
	image: string,
	tiled = false,
	termId: string | null = null,
	consentVersion: string | null = null
) {
	if (image.length > IMAGE_MAX || !IMAGE_PATTERN.test(image)) {
		return { message: '画像を読み込めませんでした。別の画像でやり直してください' };
	}
	const since = new Date(Date.now() - DAY);
	const today = db.select({ n: count() }).from(importJobs).where(and(eq(importJobs.userId, userId), gte(importJobs.createdAt, since)));
	const active = db
		.select({ n: count() })
		.from(importJobs)
		.where(and(eq(importJobs.userId, userId), inArray(importJobs.status, ['queued', 'processing', 'retry'])));
	const [[todayCount], [activeCount]] = await db.batch([today, active]);
	if ((todayCount?.n ?? 0) >= DAILY_LIMIT) return { message: TODAY_FULL };
	if ((activeCount?.n ?? 0) >= ACTIVE_LIMIT) return { message: ACTIVE_FULL };
	const deferred = (await quotaUsed(db)) >= TOTAL_DAILY_LIMIT;
	const retryAt = deferred ? await readSlot(db) : null;
	if (deferred && !retryAt) return { message: CROWDED };

	// The day's total is judged again as the job is saved; one that fills up meanwhile puts it
	// off to the next morning
	const id = crypto.randomUUID();
	const used = db.select({ n: count() }).from(importJobs).where(spokenFor());
	const later = (retryAt ?? nextRetryTime()).getTime();
	const saved = await db.run(sql`
		insert into ${importJobs} (id, user_id, timetable_id, image, tiled, term_id, consent_version, status, retry_at)
		select ${id}, ${userId}, ${timetableId}, ${image}, ${tiled ? 1 : 0}, ${termId}, ${consentVersion},
			case when (${used}) >= ${TOTAL_DAILY_LIMIT} then 'retry' else 'queued' end,
			case when (${used}) >= ${TOTAL_DAILY_LIMIT} then ${later} else null end
		where (${today}) < ${DAILY_LIMIT} and (${active}) < ${ACTIVE_LIMIT}`);
	if (!saved.meta.changes) {
		// Another screenshot took the last place between the checks and here
		const [t] = await today;
		return { message: (t?.n ?? 0) >= DAILY_LIMIT ? TODAY_FULL : ACTIVE_FULL };
	}
	const row = await db.select({ status: importJobs.status }).from(importJobs).where(eq(importJobs.id, id)).get();
	return { id, deferred: row?.status === 'retry' };
}

const TODAY_FULL = `読み込みは1日${DAILY_LIMIT}回までです。明日またやり直してください`;
const ACTIVE_FULL = '読み込み中のものが終わってから、次の画像を送ってください';
const CROWDED = '読み込みが混み合っています。しばらくたってから、もう一度やり直してください';

/** Hands the job to the queue, or in development (no consumer runs) reads it right away. */
export async function enqueue(
	env: Env,
	ctx: { waitUntil(promise: Promise<unknown>): void } | undefined,
	db: Db,
	jobId: string,
	inline: boolean
) {
	if (!inline && env.IMPORT_QUEUE) {
		await env.IMPORT_QUEUE.send({ jobId });
		return;
	}
	const work = processImportJob(env, db, jobId).catch((e) => console.error('import failed', e));
	if (ctx) ctx.waitUntil(work);
	else await work;
}

export type Outcome = { status: 'done' | 'retry' | 'failed' | 'skipped' } | { status: 'busy'; seconds: number };

/**
 * Reads one screenshot: Groq first, then Workers AI when Groq is out of quota, fails or
 * answers in the wrong shape. With neither available the job waits for tomorrow, up to
 * three tries; the image is cleared as soon as it has been read or given up on.
 */
export async function processImportJob(env: Env, db: Db, jobId: string): Promise<Outcome> {
	// Claim the job, so a message delivered twice reads it once.
	const job = await db
		.update(importJobs)
		.set({ status: 'processing' })
		.where(and(eq(importJobs.id, jobId), inArray(importJobs.status, ['queued', 'retry'])))
		.returning()
		.get();
	if (!job) {
		// Still being read (a second delivery of the message): look again later, so the message
		// isn't dropped while the job could yet be put back. Otherwise it's finished.
		const now = await db.select({ status: importJobs.status }).from(importJobs).where(eq(importJobs.id, jobId)).get();
		return now?.status === 'processing' ? { status: 'busy', seconds: 60 } : { status: 'skipped' };
	}
	let outcome: Outcome;
	try {
		outcome = await readJob(env, db, job);
	} catch (e) {
		// Something other than the AIs failed (D1, say): back in line, and the message is retried.
		await db
			.update(importJobs)
			.set({ status: 'queued' })
			.where(and(eq(importJobs.id, jobId), eq(importJobs.status, 'processing')))
			.catch(() => {});
		throw e;
	}
	if (outcome.status === 'done' || outcome.status === 'failed') {
		await notify(
			env,
			db,
			[job.userId],
			'importDone',
			outcome.status === 'done'
				? {
						title: 'スクショの読み取りが終わりました',
						body: '読み取った授業を見直して、時間割に保存してください',
						url: `/import/${job.id}`,
						tag: `import-${job.id}`
					}
				: {
						title: 'スクショを読み取れませんでした',
						body: '画像を切り抜き直すか、授業を自分で入力してください',
						url: '/import',
						tag: `import-${job.id}`
					}
		);
	}
	return outcome;
}

async function readJob(env: Env, db: Db, job: typeof importJobs.$inferSelect): Promise<Outcome> {
	const jobId = job.id;
	const attempts = job.attempts + 1;

	const finish = (values: Partial<typeof importJobs.$inferInsert>) =>
		db.update(importJobs).set({ attempts, ...values }).where(eq(importJobs.id, jobId));
	if (!job.image) {
		await finish({ status: 'failed', error: 'no image', finishedAt: new Date() });
		return { status: 'failed' };
	}

	const errors: string[] = [];
	const providers: { name: 'groq' | 'workers-ai'; read: () => Promise<unknown> }[] = [];
	if (env.GROQ_API_KEY) providers.push({ name: 'groq', read: () => readWithGroq(env.GROQ_API_KEY!, job.image!, job.tiled) });
	if (env.AI) providers.push({ name: 'workers-ai', read: () => readWithWorkersAi(env.AI, job.image!, job.tiled) });

	for (const provider of providers) {
		let courses;
		try {
			courses = readImport(await provider.read());
		} catch (e) {
			// A short wait is worth it for Groq, which reads Japanese better.
			if (e instanceof Busy && provider.name === 'groq') {
				// Waiting doesn't count as a try.
				await finish({ status: 'queued', attempts: job.attempts });
				return { status: 'busy', seconds: e.seconds };
			}
			errors.push(`${provider.name}: ${e instanceof OutOfQuota ? 'out of quota' : e instanceof Error ? e.message : e}`);
			continue;
		}
		// Outside the try, so a failed write isn't taken for the AI failing.
		if (courses) {
			await finish({ status: 'done', provider: provider.name, result: courses, image: null, error: null, finishedAt: new Date() });
			return { status: 'done' };
		}
		errors.push(`${provider.name}: unexpected answer`);
	}

	const tooOld = Date.now() - job.createdAt.getTime() > KEEP_DAYS * DAY;
	if (attempts >= ATTEMPTS_MAX || tooOld || !providers.length) {
		await finish({ status: 'failed', image: null, error: errors.join('; ') || 'no provider', finishedAt: new Date() });
		return { status: 'failed' };
	}
	await finish({ status: 'retry', retryAt: nextRetryTime(), error: errors.join('; ') });
	return { status: 'retry' };
}

// How many screenshots are ahead of this one
export async function queuePosition(db: Db, job: { createdAt: Date }) {
	const [row] = await db
		.select({ n: count() })
		.from(importJobs)
		.where(and(inArray(importJobs.status, ['queued', 'processing']), lt(importJobs.createdAt, job.createdAt)));
	return row?.n ?? 0;
}

export function latestJobs(db: Db, userId: string) {
	return db
		.select({
			id: importJobs.id,
			status: importJobs.status,
			createdAt: importJobs.createdAt,
			finishedAt: importJobs.finishedAt,
			closedAt: importJobs.closedAt,
			retryAt: importJobs.retryAt,
			attempts: importJobs.attempts
		})
		.from(importJobs)
		.where(eq(importJobs.userId, userId))
		.orderBy(desc(importJobs.createdAt))
		.limit(10);
}

/** Finished imports the user hasn't looked at yet, for the banner on the timetable */
export async function unreviewedImport(db: Db, userId: string) {
	return db
		.select({ id: importJobs.id, status: importJobs.status })
		.from(importJobs)
		.where(and(eq(importJobs.userId, userId), inArray(importJobs.status, ['done', 'failed']), isNull(importJobs.closedAt)))
		.orderBy(desc(importJobs.createdAt))
		.get();
}

/**
 * Once a day: jobs put off until today go back in the queue, stuck ones too, jobs older
 * than three days are given up (their images with them), and expired sign-in leftovers go.
 */
export async function dailySweep(env: Env, db: Db) {
	const now = new Date();
	const stuck = new Date(now.getTime() - 60 * 60 * 1000);
	const old = new Date(now.getTime() - KEEP_DAYS * DAY);

	await db.batch([
		db
			.update(importJobs)
			.set({ status: 'failed', image: null, error: 'gave up after three days', finishedAt: now })
			.where(and(inArray(importJobs.status, ['queued', 'processing', 'retry']), lt(importJobs.createdAt, old))),
		db
			.update(importJobs)
			.set({ image: null })
			.where(and(inArray(importJobs.status, ['done', 'failed']), isNotNull(importJobs.image))),
		db.delete(importJobs).where(lt(importJobs.createdAt, new Date(now.getTime() - 30 * DAY))),
		db.delete(sessions).where(lt(sessions.expiresAt, now)),
		db.delete(emailTokens).where(lt(emailTokens.expiresAt, now)),
		db.delete(authChallenges).where(lt(authChallenges.expiresAt, now))
	]);

	const due = await db
		.update(importJobs)
		.set({ status: 'queued' })
		.where(
			or(
				and(eq(importJobs.status, 'retry'), lte(importJobs.retryAt, now)),
				and(inArray(importJobs.status, ['queued', 'processing']), lt(importJobs.createdAt, stuck))
			)
		)
		.returning({ id: importJobs.id });
	for (const job of due) await enqueue(env, undefined, db, job.id, false);
	return due.length;
}
