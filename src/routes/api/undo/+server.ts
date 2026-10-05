import { error, json } from '@sveltejs/kit';
import { undoDelete } from '$lib/server/undo';
import type { RequestHandler } from './$types';

// 元に戻す after deleting a memo, a task or an event (src/lib/components/UndoToast.svelte)
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401);
	const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
	if (typeof id !== 'string') error(400);
	if (!(await undoDelete(locals.db, locals.user.id, id))) error(410, '元に戻せませんでした');
	return json({ ok: true });
};
