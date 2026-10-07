import { error, json } from '@sveltejs/kit';
import { acknowledgeWarning, pendingWarning } from '$lib/server/moderation';
import type { RequestHandler } from './$types';

// Whether a warning is waiting, asked by the app as it moves between pages and comes back to
// the front (src/routes/+layout.svelte): the layout's data is read only when the app opens.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ id: null }, { headers: { 'cache-control': 'no-store' } });
	const warning = await pendingWarning(locals.db, locals.user.id);
	return json({ id: warning?.id ?? null }, { headers: { 'cache-control': 'no-store' } });
};

// 理解しました on a warning (src/lib/components/WarningScreen.svelte)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401);
	const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
	if (typeof id !== 'string') error(400);
	await acknowledgeWarning(locals.db, locals.user.id, id);
	return json({ ok: true });
};
