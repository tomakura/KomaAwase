import { fail, redirect } from '@sveltejs/kit';
import { GROUPS_A_DAY, GROUPS_OWNED_MAX, GROUP_NAME_MAX, createGroup, readGroupName } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const name = readGroupName((await request.formData()).get('name'));
		if (!name) return fail(400, { message: `グループの名前は1〜${GROUP_NAME_MAX}文字で入れてください` });
		const made = await createGroup(locals.db, locals.user.id, name);
		if ('limit' in made) {
			return fail(429, {
				message:
					made.limit === 'owned'
						? `作ったグループは${GROUPS_OWNED_MAX}個までです。使わないグループを消してから作ってください`
						: `グループは1日${GROUPS_A_DAY}個まで作れます。明日またやり直してください`
			});
		}
		redirect(303, `/groups/${made.id}`);
	}
};
