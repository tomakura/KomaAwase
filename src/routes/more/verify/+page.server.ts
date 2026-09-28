import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { sendRelayMail } from '$lib/server/auth/email';
import { universities } from '$lib/server/db/schema';
import { RATE_LIMITED_MESSAGE, isRateLimited } from '$lib/server/rate-limit';
import { dropToken, startVerification, verificationOf } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const [verification, university] = await Promise.all([
		verificationOf(locals.db, locals.user.id),
		locals.user.universityId
			? locals.db.select().from(universities).where(eq(universities.id, locals.user.universityId)).get()
			: undefined
	]);
	return {
		university: university ? { name: university.name, domains: university.emailDomains } : null,
		verification:
			verification && {
				email: verification.email,
				university: verification.university,
				expiresAt: verification.expiresAt.getTime(),
				// A check for a university the user has since moved away from doesn't count.
				current: verification.universityId === locals.user.universityId && verification.expiresAt.getTime() > Date.now()
			}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { locals, request, url, platform } = event;
		if (!locals.user) redirect(303, '/login');
		if (!platform) error(500);
		if (await isRateLimited(event, platform.env.EMAIL_LINK_LIMITER)) return fail(429, { message: RATE_LIMITED_MESSAGE });

		const started = await startVerification(locals.db, locals.user, String((await request.formData()).get('email') ?? ''));
		if ('message' in started) return fail(400, { message: started.message });
		try {
			await sendRelayMail(platform.env, 'verify', started.email, `${url.origin}/verify/${started.token}`);
		} catch (e) {
			console.error('verification mail failed', e);
			await dropToken(locals.db, started.token);
			return fail(502, { message: 'メールを送れませんでした。時間をおいてもう一度お試しください' });
		}
		return { sentTo: started.email };
	}
};
