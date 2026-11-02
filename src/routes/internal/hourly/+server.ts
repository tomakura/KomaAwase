import { json } from '@sveltejs/kit';
import { requireInternal } from '$lib/server/internal';
import { requeueStuck } from '$lib/server/import/jobs';
import type { RequestHandler } from './$types';

// Once an hour, from the every-minute cron (worker/entry.js)
export const POST: RequestHandler = async ({ platform, locals }) => {
	const env = requireInternal(platform);
	return json({ requeued: await requeueStuck(env, locals.db) });
};
