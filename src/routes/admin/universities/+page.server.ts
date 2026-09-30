import { requireAdmin } from '$lib/server/auth/reauth';
import { SUGGEST_MIN_USERS, listUserUniversities } from '$lib/server/universities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	return { userUniversities: await listUserUniversities(locals.db), suggestMin: SUGGEST_MIN_USERS };
};
