import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { TOTAL_DAILY_LIMIT } from '$lib/import-quota';
import { DAILY_LIMIT, latestJobs, queuePosition, quotaUsed, readSlot } from '$lib/server/import/jobs';
import { users } from '$lib/server/db/schema';
import { currentTimetable } from '$lib/server/timetable';
import { sharedAccess } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

// `back` is whatever the query said, so one that cannot be read as a URL (//, http://[) gives no term
const backTerm = (back: string | null) => {
	if (!back) return null;
	try {
		return new URL(back, 'https://x.invalid').searchParams.get('term');
	} catch {
		return null;
	}
};

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	const me = requireUser(locals, url);
	if (!me.setupAt) redirect(303, '/');
	depends('app:import');
	const [jobs, timetable, used] = await Promise.all([
		latestJobs(locals.db, me.id),
		currentTimetable(locals.db, me, locals.timetable),
		quotaUsed(locals.db)
	]);
	// Screenshot reading is for people with an enrollment check
	const access = await sharedAccess(locals.db, me.id, timetable.universityId);
	// The one to show: the newest that is still going, or finished and not yet looked at
	const current = jobs.find((j) => !j.closedAt);
	return {
		access,
		// Agreed once, before the first screenshot, to it going to the AI services
		consented: !!me.importConsentAt,
		// Everyone's screenshots for today are taken: when one sent now would be read (null when it is read at once)
		readAt: used >= TOTAL_DAILY_LIMIT ? ((await readSlot(locals.db))?.getTime() ?? null) : null,
		dailyLimit: DAILY_LIMIT,
		back: safeNext(url.searchParams.get('back')) ?? '/',
		// The term the person was looking at when they came here, so the review starts with it
		term: url.searchParams.get('term') ?? backTerm(url.searchParams.get('back')),
		job: current
			? {
					id: current.id,
					status: current.status,
					createdAt: current.createdAt.getTime(),
					retryAt: current.retryAt?.getTime() ?? null,
					// Put off before it was tried: today's total was used up
					deferred: current.status === 'retry' && current.attempts === 0,
					ahead: current.status === 'queued' ? await queuePosition(locals.db, current) : 0
				}
			: null
	};
};

export const actions: Actions = {
	consent: async ({ locals, url }) => {
		const me = requireUser(locals, url);
		await locals.db.update(users).set({ importConsentAt: new Date() }).where(eq(users.id, me.id));
	}
};
