import { fail, redirect } from '@sveltejs/kit';
import { readIcon, saveIcon } from '$lib/server/icon';
import { removePhoto } from '$lib/server/photos';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { id, nickname, icon } = locals.user;
	return { user: { id, nickname, icon } };
};

export const actions: Actions = {
	// The letters, the color and a newly framed photo (when there is one) are saved together
	save: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const icon = readIcon(await request.formData());
		if ('message' in icon) return fail(400, { message: icon.message });
		await saveIcon(locals.db, locals.user, icon);
		redirect(303, '/more');
	},
	removePhoto: async ({ locals }) => {
		if (!locals.user) redirect(303, '/login');
		await removePhoto(locals.db, locals.user);
		return { removed: true };
	}
};
