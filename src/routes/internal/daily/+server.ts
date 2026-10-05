import { json } from '@sveltejs/kit';
import { requireInternal } from '$lib/server/internal';
import { dailySweep } from '$lib/server/import/jobs';
import { sweepRateCounts } from '$lib/server/mail-limit';
import { recordDailyStats } from '$lib/server/stats';
import { sweepUndo } from '$lib/server/undo';
import type { RequestHandler } from './$types';

// The daily cron (10:00 Japan time, an hour after the free quotas of the AIs reset)
export const POST: RequestHandler = async ({ platform, locals }) => {
	const env = requireInternal(platform);
	await sweepRateCounts(locals.db);
	await sweepUndo(locals.db);
	const requeued = await dailySweep(env, locals.db);
	// The counts for 運営 → 数字, kept even if the sweep itself has nothing to do
	await recordDailyStats(locals.db);
	return json({ requeued });
};
