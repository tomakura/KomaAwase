import { redirect } from '@sveltejs/kit';
import { listBlocked, unblock } from '$lib/server/friends';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { blocked: await listBlocked(locals.db, locals.user.id) };
};

export const actions: Actions = {
	unblock: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		await unblock(locals.db, locals.user.id, String((await request.formData()).get('id') ?? ''));
	}
};
