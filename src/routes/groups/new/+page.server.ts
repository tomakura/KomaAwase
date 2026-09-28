import { fail, redirect } from '@sveltejs/kit';
import { GROUP_NAME_MAX, createGroup, readGroupName } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const name = readGroupName((await request.formData()).get('name'));
		if (!name) return fail(400, { message: `グループの名前は1〜${GROUP_NAME_MAX}文字で入れてください` });
		const id = await createGroup(locals.db, locals.user.id, name);
		redirect(303, `/groups/${id}`);
	}
};
