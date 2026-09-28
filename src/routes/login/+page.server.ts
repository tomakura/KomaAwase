import { error, fail, redirect } from '@sveltejs/kit';
import { consumeEmailToken, createEmailToken, normalizeEmail, sendSignInEmail } from '$lib/server/auth/email';
import { googleEnabled } from '$lib/server/auth/google';
import { rememberNext, safeNext } from '$lib/server/auth/next';
import { RATE_LIMITED_MESSAGE, isRateLimited } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, cookies, platform }) => {
	const next = url.searchParams.get('next');
	if (locals.user) redirect(303, safeNext(next) ?? '/');
	return {
		next: rememberNext(cookies, next),
		bye: url.searchParams.has('bye'),
		google: googleEnabled(platform?.env),
		googleFailed: url.searchParams.get('error') === 'google'
	};
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
		try {
			await sendSignInEmail(platform.env, email, `${url.origin}/auth/email/${token}`);
		} catch (e) {
			console.error('sign-in mail failed', e);
			// Drop the unsent link so it doesn't count toward the per-address limit.
			await consumeEmailToken(locals.db, token);
			return fail(502, { message: 'メールを送れませんでした。時間をおいてもう一度お試しください' });
		}
		return { sentTo: email };
	}
};
