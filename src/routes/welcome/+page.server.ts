import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { passkeys, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const NICKNAME_MAX = 20;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const passkey = await locals.db
		.select({ id: passkeys.id })
		.from(passkeys)
		.where(eq(passkeys.userId, locals.user.id))
		.get();
	return { nickname: locals.user.nickname, hasPasskey: !!passkey };
};

export const actions: Actions = {
	nickname: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const nickname = String((await request.formData()).get('nickname') ?? '').trim();
		if (!nickname || [...nickname].length > NICKNAME_MAX) {
			return fail(400, { message: `ニックネームは1〜${NICKNAME_MAX}文字で入れてください` });
		}
		await locals.db.update(users).set({ nickname }).where(eq(users.id, locals.user.id));
	}
};
