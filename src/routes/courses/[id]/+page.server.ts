import { error, redirect } from '@sveltejs/kit';
import { loadCourse } from '$lib/server/courses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/login');
	const loaded = await loadCourse(locals.db, locals.user.id, params.id);
	if (!loaded) error(404, '授業が見つかりません');
	return { ...loaded, termParam: url.searchParams.get('term') };
};
