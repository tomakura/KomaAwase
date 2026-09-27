import { fail, redirect } from '@sveltejs/kit';
import { createEmailToken, normalizeEmail, sendSignInEmail } from '$lib/server/auth/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	email: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		if (!email) return fail(400, { message: 'メールアドレスを確認してください' });

		const token = await createEmailToken(locals.db, email);
		await sendSignInEmail(email, `${url.origin}/auth/email/${token}`);
		return { sentTo: email };
	}
};
