import { error } from '@sveltejs/kit';
import { loadStats } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

// Counts only, for whoever runs the app: nothing here says who anyone is
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	return loadStats(locals.db);
};
