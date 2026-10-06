import { error } from '@sveltejs/kit';
import { signals } from '$lib/server/status';
import { LEVEL_LABELS } from '$lib/status';
import type { RequestHandler } from './$types';

// One of the levels on its own, for the status page's checks (UptimeFlare): 503 only while it
// is 止まっている, since a check there is either up or down. Counts only, open to anyone.
export const GET: RequestHandler = async ({ locals, params }) => {
	const s = (await signals(locals.db)).find((x) => x.id === params.id);
	if (!s) error(404, 'Not found');
	return new Response(`${LEVEL_LABELS[s.level]}: ${s.text}\n`, {
		status: s.level === 'down' ? 503 : 200,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
};
