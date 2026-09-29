import { redirect } from '@sveltejs/kit';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { DAILY_LIMIT, latestJobs, queuePosition } from '$lib/server/import/jobs';
import type { PageServerLoad } from './$types';

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
	const jobs = await latestJobs(locals.db, me.id);
	// The one to show: the newest that is still going, or finished and not yet looked at
	const current = jobs.find((j) => !j.closedAt);
	return {
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
					ahead: current.status === 'queued' ? await queuePosition(locals.db, current) : 0
				}
			: null
	};
};
