import { error, redirect } from '@sveltejs/kit';
import { findOwnedCourse } from '$lib/server/courses';
import { filesEnabled, openFile } from '$lib/server/files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const env = platform?.env;
	if (!env || !filesEnabled(env)) error(503, '資料はまだ使えません');
	if (!(await findOwnedCourse(locals.db, locals.user.id, params.id))) error(404, '資料が見つかりません');
	const res = await openFile(env, locals.db, params.id, params.fileId);
	if (!res) error(404, '資料が見つかりません');
	return res;
};
