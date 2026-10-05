import { json } from '@sveltejs/kit';
import { loadNotes, signals } from '$lib/server/status';
import type { RequestHandler } from './$types';

// What /status shows (and the strip at the top of the app while there is trouble). Open to
// anyone: notices from the operator and levels made from counts, nothing about anyone.
export const GET: RequestHandler = async ({ locals }) => {
	const [notes, levels] = await Promise.all([loadNotes(locals.db), signals(locals.db)]);
	return json(
		{
			notes: notes.map((n) => ({ id: n.id, level: n.level, body: n.body, createdAt: n.createdAt.getTime(), resolvedAt: n.resolvedAt?.getTime() ?? null })),
			signals: levels,
			at: Date.now()
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
