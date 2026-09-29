import { error, json } from '@sveltejs/kit';
import { markVerifyPrompt } from '$lib/server/verify';
import type { RequestHandler } from './$types';

// The screen that suggests confirming enrollment was shown: it won't come again for that stage
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	// Only this site's pages may ask (SvelteKit checks this for forms, not for fetch).
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	const body = (await request.json().catch(() => null)) as { stage?: unknown } | null;
	if (typeof body?.stage !== 'number') error(400, 'bad request');
	await markVerifyPrompt(locals.db, locals.user.id, body.stage);
	return json({ ok: true });
};
