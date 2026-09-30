import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { universities } from '$lib/server/db/schema';
import { daysLeft } from '$lib/verify-prompt';
import { sendVerificationMail, verificationOf } from '$lib/server/verify';
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
				days: daysLeft(verification.expiresAt.getTime(), Date.now()),
				// A check for a university the user has since moved away from doesn't count.
				current: verification.universityId === locals.user.universityId && verification.expiresAt.getTime() > Date.now()
			}
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const sent = await sendVerificationMail(event);
		if ('message' in sent) return fail(sent.status, { message: sent.message, email: sent.email });
		return { sentTo: sent.sentTo };
	}
};
