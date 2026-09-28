import { fail, redirect } from '@sveltejs/kit';
import { friendCodeOf, readCode, regenerateFriendCode } from '$lib/server/friends';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const code = await friendCodeOf(locals.db, locals.user);
	return { code, link: `${url.origin}/add/${code}` };
};

export const actions: Actions = {
	// A code typed in, or a friend's link pasted, opens their page to send the request.
	find: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const code = readCode(String((await request.formData()).get('code') ?? ''));
		if (!code) return fail(400, { message: '10文字のコードか、友だちリンクを入れてください' });
		redirect(303, `/add/${code}`);
	},
	regenerate: async ({ locals }) => {
		if (!locals.user) redirect(303, '/login');
		await regenerateFriendCode(locals.db, locals.user.id);
		return { regenerated: true };
	}
};
