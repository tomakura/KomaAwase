import { error, fail, redirect } from '@sveltejs/kit';
import { consumeEmailToken, createEmailToken, normalizeEmail, sendSignInEmail } from '$lib/server/auth/email';
import { googleEnabled } from '$lib/server/auth/google';
import { rememberNext, safeNext } from '$lib/server/auth/next';
import { REAUTH, readReauth } from '$lib/server/auth/reauth';
import { MAIL_COOLDOWN_MESSAGE, MAIL_LIMIT_MESSAGES, takeMailBudget } from '$lib/server/mail-limit';
import { RATE_LIMITED_MESSAGE, isRateLimited } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, cookies, platform }) => {
	const next = url.searchParams.get('next');
	// Signed in already: only asked to sign in again (before leaving the app, say)
	const reauth = locals.user ? readReauth(url.searchParams.get('reauth')) : null;
	if (locals.user && !reauth) redirect(303, safeNext(next) ?? '/');
	return {
		next: rememberNext(cookies, next),
		reauth: reauth && { lead: REAUTH[reauth].lead, back: REAUTH[reauth].back },
		bye: url.searchParams.has('bye'),
		google: googleEnabled(platform?.env),
		googleFailed: url.searchParams.get('error') === 'google',
		googleUseMail: url.searchParams.get('error') === 'google-mail',
		suspended: url.searchParams.get('error') === 'suspended'
	};
};

export const actions: Actions = {
	email: async (event) => {
		const { request, locals, url, platform } = event;
		if (!platform) error(500);
		const input = String((await request.formData()).get('email') ?? '');
		if (await isRateLimited(event, platform.env.EMAIL_LINK_LIMITER)) {
			return fail(429, { message: RATE_LIMITED_MESSAGE, email: input });
		}

		const email = normalizeEmail(input);
		if (!email) return fail(400, { message: 'メールアドレスを確認してください', email: input });

		const created = await createEmailToken(locals.db, email);
		if ('error' in created) {
			const message =
				created.error === 'cooldown'
					? MAIL_COOLDOWN_MESSAGE
					: 'このアドレスには、続けてメールを送りました。届いたメールを確かめるか、15分ほどたってから、もう一度送ってください。';
			return fail(429, { message, email });
		}
		// All users together, so the rental server keeps sending
		const budget = await takeMailBudget(locals.db);
		if (budget !== 'ok') {
			await consumeEmailToken(locals.db, created.token);
			return fail(503, { message: MAIL_LIMIT_MESSAGES[budget], limit: true, email });
		}
		try {
			await sendSignInEmail(platform.env, email, `${url.origin}/auth/email/${created.token}`);
		} catch (e) {
			console.error('sign-in mail failed', e);
			// Drop the unsent link so it doesn't count toward the per-address limit.
			await consumeEmailToken(locals.db, created.token);
			return fail(502, { message: 'メールを送れませんでした。時間をおいてもう一度やり直してください', email });
		}
		return { sentTo: email };
	}
};
