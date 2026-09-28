import { fail } from '@sveltejs/kit';
import { finishVerification } from '$lib/server/verify';
import type { Actions } from './$types';

// The link from the enrollment mail. It works signed in or not: only the mailbox owner has
// it, and it names the account. Used on POST only, since mail scanners open links with GET.
export const actions: Actions = {
	default: async ({ params, locals }) => {
		const done = await finishVerification(locals.db, params.token);
		if (!done) return fail(400, { message: 'リンクの期限が切れているか、すでに使われています' });
		return { university: done.university };
	}
};
