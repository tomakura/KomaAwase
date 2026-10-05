import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/reauth';
import { UNIVERSITY_NAME_MAX, deleteUniversity, getUserUniversity, renameUniversity } from '$lib/server/universities';
import type { Actions, PageServerLoad } from './$types';

// A university someone typed in: the admin can fix its name or delete an unsuitable one
export const load: PageServerLoad = async ({ locals, params, url }) => {
	await requireAdmin(locals, url);
	const university = await getUserUniversity(locals.db, params.id);
	if (!university) error(404, '大学が見つかりません');
	return { university, nameMax: UNIVERSITY_NAME_MAX };
};

export const actions: Actions = {
	rename: async ({ locals, params, url, request }) => {
		await requireAdmin(locals, url);
		if (!(await getUserUniversity(locals.db, params.id))) error(404, '大学が見つかりません');
		const message = await renameUniversity(locals.db, params.id, String((await request.formData()).get('name') ?? ''));
		if (message) return fail(400, { message });
		return { renamed: true };
	},
	remove: async ({ locals, params, url }) => {
		await requireAdmin(locals, url);
		if (!(await getUserUniversity(locals.db, params.id))) error(404, '大学が見つかりません');
		await deleteUniversity(locals.db, params.id);
		redirect(303, '/admin/universities');
	}
};
