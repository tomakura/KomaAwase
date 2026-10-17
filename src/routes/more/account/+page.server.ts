import { redirect } from '@sveltejs/kit';
import { and, count, eq, gt } from 'drizzle-orm';
import { passkeys, sessions, universities } from '$lib/server/db/schema';
import { daysLeft } from '$lib/verify-prompt';
import { verificationOf } from '$lib/server/verify';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const user = locals.user;
	const [[keys], [devices], university, verification] = await Promise.all([
		locals.db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, user.id)),
		locals.db
			.select({ n: count() })
			.from(sessions)
			.where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))),
		user.universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, user.universityId)).get()
			: undefined,
		verificationOf(locals.db, user.id)
	]);

	const valid = !!verification && verification.universityId === user.universityId && verification.expiresAt.getTime() > Date.now();

	return {
		user: { id: user.id, nickname: user.nickname, icon: user.icon },
		universityName: university?.name ?? null,
		passkeyCount: keys?.n ?? 0,
		sessionCount: devices?.n ?? 1,
		// Days until the check lapses, when there is one to lapse
		verifyDays: valid && verification ? daysLeft(verification.expiresAt.getTime(), Date.now()) : null
	};
};
