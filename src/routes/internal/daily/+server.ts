import { json } from '@sveltejs/kit';
import { requireInternal } from '$lib/server/internal';
import { dailySweep } from '$lib/server/import/jobs';
import { sweepRateCounts } from '$lib/server/mail-limit';
import type { RequestHandler } from './$types';

// The daily cron (10:00 Japan time, an hour after the free quotas of the AIs reset)
export const POST: RequestHandler = async ({ platform, locals }) => {
	const env = requireInternal(platform);
	await sweepRateCounts(locals.db);
	return json({ requeued: await dailySweep(env, locals.db) });
};
