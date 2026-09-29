import { json } from '@sveltejs/kit';
import { requireInternal } from '$lib/server/internal';
import { dailySweep } from '$lib/server/import/jobs';
import type { RequestHandler } from './$types';

// The daily cron (10:00 Japan time, an hour after the free quotas of the AIs reset)
export const POST: RequestHandler = async ({ platform, locals }) => {
	const env = requireInternal(platform);
	return json({ requeued: await dailySweep(env, locals.db) });
};
