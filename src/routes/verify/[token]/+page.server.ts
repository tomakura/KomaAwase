import { fail, redirect } from '@sveltejs/kit';
import { takeNext, takeVerifyNext } from '$lib/server/auth/next';
import { finishVerification, peekVerification } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

// The link from the enrollment mail. It works only for the account that asked for it, signed
// in: the page says which account and address, so a link that reached someone else can't
// confirm their account. Used on POST only, since mail scanners open links with GET.
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const link = await peekVerification(locals.db, params.token);
	if (!link) return { state: 'expired' as const };
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (link.userId !== locals.user.id) return { state: 'other-account' as const };
	if (link.taken) return { state: 'taken' as const };
	return { state: 'ready' as const, nickname: link.nickname ?? '', university: link.university, email: link.email };
};

export const actions: Actions = {
	default: async ({ params, locals, url, cookies }) => {
		if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
		const done = await finishVerification(locals.db, params.token, locals.user.id);
		if (!done) return fail(400, { message: 'リンクの期限が切れているか、すでに使われています' });
		if (done === 'other-account' || done === 'taken') return fail(409, { state: done });
		// On to the page that suggested the check, or what was waiting through はじめの設定 (a
		// friend's link, an invite)
		return { university: done.university, next: takeVerifyNext(cookies) ?? takeNext(cookies) ?? '/' };
	}
};
