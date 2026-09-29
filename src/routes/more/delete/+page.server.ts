import { error, fail, redirect } from '@sveltejs/kit';
import { deleteAccount } from '$lib/server/account';
import { clearSessionCookie } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { email: locals.user.email };
};

export const actions: Actions = {
	default: async ({ locals, platform, cookies, request }) => {
		if (!locals.user) redirect(303, '/login');
		if (!platform) error(500);
		if ((await request.formData()).get('confirm') !== 'on') return fail(400, { message: '確認のチェックを入れてください' });
		let result;
		try {
			result = await deleteAccount(platform.env, locals.db, locals.user.id);
		} catch (e) {
			console.error('account deletion failed', e);
			return fail(502, { message: '資料のファイルを消せませんでした。時間をおいてもう一度やり直してください' });
		}
		// Many files take several rounds; the page sends the form again.
		if (result === 'more') return { more: true };
		clearSessionCookie(cookies);
		redirect(303, '/login?bye=1');
	}
};
