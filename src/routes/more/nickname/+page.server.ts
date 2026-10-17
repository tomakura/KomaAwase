import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { NICKNAME_MAX, isNickname } from '$lib/icons';
import { users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { nickname: locals.user.nickname ?? '' };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const nickname = String((await request.formData()).get('nickname') ?? '').trim();
		if (!isNickname(nickname)) {
			return fail(400, { message: `ニックネームは1〜${NICKNAME_MAX}文字で入れてください` });
		}
		await locals.db.update(users).set({ nickname }).where(eq(users.id, locals.user.id));
		redirect(303, '/more/account');
	}
};
