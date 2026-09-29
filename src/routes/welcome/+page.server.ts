import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { NICKNAME_MAX, isNickname } from '$lib/icons';
import { readIcon, saveIcon } from '$lib/server/icon';
import { passkeys, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const passkey = await locals.db
		.select({ id: passkeys.id })
		.from(passkeys)
		.where(eq(passkeys.userId, locals.user.id))
		.get();
	return { id: locals.user.id, nickname: locals.user.nickname, hasPasskey: !!passkey };
};

export const actions: Actions = {
	nickname: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const nickname = String(form.get('nickname') ?? '').trim();
		if (!isNickname(nickname)) {
			return fail(400, { message: `ニックネームは1〜${NICKNAME_MAX}文字で入れてください` });
		}
		const icon = readIcon(form);
		if ('message' in icon) return fail(400, { message: icon.message });
		// The icon first: the nickname is what ends this screen, so if the icon can't be saved the
		// form is still there to send again.
		await saveIcon(locals.db, { ...locals.user, nickname }, icon);
		await locals.db.update(users).set({ nickname }).where(eq(users.id, locals.user.id));
		// locals.user is from before the update; a fresh request reads the saved nickname.
		redirect(303, '/welcome');
	}
};
