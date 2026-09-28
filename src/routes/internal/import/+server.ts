import { error, json } from '@sveltejs/kit';
import { requireInternal } from '$lib/server/internal';
import { processImportJob } from '$lib/server/import/jobs';
import type { RequestHandler } from './$types';

// One message from the screenshot queue
export const POST: RequestHandler = async ({ platform, request, locals }) => {
	const env = requireInternal(platform);
	const { jobId } = (await request.json()) as { jobId?: unknown };
	if (typeof jobId !== 'string') error(400);
	return json(await processImportJob(env, locals.db, jobId));
};
