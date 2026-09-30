import { error, json } from '@sveltejs/kit';
import { acknowledgeWarning } from '$lib/server/moderation';
import type { RequestHandler } from './$types';

// 理解しました on a warning (src/lib/components/WarningScreen.svelte)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401);
	const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
	if (typeof id !== 'string') error(400);
	await acknowledgeWarning(locals.db, locals.user.id, id);
	return json({ ok: true });
};
