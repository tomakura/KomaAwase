import { requireAdmin } from '$lib/server/auth/reauth';
import { loadStats } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

// Counts only, for whoever runs the app: nothing here says who anyone is
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	return loadStats(locals.db);
};
