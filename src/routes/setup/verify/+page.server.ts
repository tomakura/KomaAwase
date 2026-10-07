import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { takeNext } from '$lib/server/auth/next';
import { universities } from '$lib/server/db/schema';
import { markVerifyPrompt, sendVerificationMail, verificationOf } from '$lib/server/verify';
import { STAGE_NEED } from '$lib/verify-prompt';
import type { Actions, PageServerLoad } from './$types';

// After はじめの設定: shown once to someone whose university can be confirmed, so the
// enrollment check is offered before anything else. Skipping is fine; it comes up again
// only through the screens that suggest it (VerifyPrompt).
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.setupAt) redirect(303, '/setup');
	const university = locals.user.universityId
		? await locals.db.select().from(universities).where(eq(universities.id, locals.user.universityId)).get()
		: undefined;
	const verification = await verificationOf(locals.db, locals.user.id);
	if (!university?.emailDomains.length) redirect(303, takeNext(cookies) ?? '/');
	const current = verification?.universityId === university.id && verification.expiresAt.getTime() > Date.now();
	// Just confirmed by the Google sign-in (see /setup): said once, then on to `next`
	if (current && url.searchParams.has('done')) {
		return { university: { name: university.name, domains: university.emailDomains }, done: verification.email };
	}
	if (current) redirect(303, takeNext(cookies) ?? '/');
	return { university: { name: university.name, domains: university.emailDomains }, done: null };
};

export const actions: Actions = {
	send: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const sent = await sendVerificationMail(event);
		if ('message' in sent) return fail(sent.status, { message: sent.message, email: sent.email });
		await markVerifyPrompt(event.locals.db, event.locals.user.id, STAGE_NEED);
		return { sentTo: sent.sentTo };
	},
	skip: async ({ locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		await markVerifyPrompt(locals.db, locals.user.id, STAGE_NEED);
		redirect(303, takeNext(cookies) ?? '/');
	}
};
