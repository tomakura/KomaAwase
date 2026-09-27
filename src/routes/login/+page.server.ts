import { error, fail, redirect } from '@sveltejs/kit';
import { createEmailToken, normalizeEmail, sendSignInEmail } from '$lib/server/auth/email';
import { RATE_LIMITED_MESSAGE, isRateLimited } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	email: async (event) => {
		const { request, locals, url, platform } = event;
		if (!platform) error(500);
		if (await isRateLimited(event, platform.env.EMAIL_LINK_LIMITER)) {
			return fail(429, { message: RATE_LIMITED_MESSAGE });
		}

		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		if (!email) return fail(400, { message: 'メールアドレスを確認してください' });

		const token = await createEmailToken(locals.db, email);
		if (!token) {
			return fail(429, { message: 'このアドレスにはリンクを送ったばかりです。届いたメールを確認してください' });
		}
		await sendSignInEmail(email, `${url.origin}/auth/email/${token}`);
		return { sentTo: email };
	}
};
