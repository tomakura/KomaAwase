import { error, redirect } from '@sveltejs/kit';
import { exportData } from '$lib/server/data-export';
import { tokyoTime } from '$lib/time';
import type { RequestHandler } from './$types';

// The person's own data as one JSON file (その他 → データの書き出し)
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const data = await exportData(locals.db, locals.user);
	if (!data.account) error(404);
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="komaawase-${tokyoTime(Date.now()).date}.json"`,
			'cache-control': 'no-store'
		}
	});
};
