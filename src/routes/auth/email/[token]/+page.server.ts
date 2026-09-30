import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { passkeys, users } from '$lib/server/db/schema';
import { SUSPENDED_MESSAGE } from '$lib/moderation';
import { consumeEmailToken } from '$lib/server/auth/email';
import { takeNext } from '$lib/server/auth/next';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import type { Actions } from './$types';

// The token is only used on POST: mail scanners open links with GET and would burn it.
export const actions: Actions = {
	default: async ({ params, locals, cookies }) => {
		const email = await consumeEmailToken(locals.db, params.token);
		if (!email) return fail(400, { message: 'リンクの期限が切れているか、すでに使われています' });

		// Two first-time links opened at once must not collide on the unique email.
		await locals.db.insert(users).values({ email }).onConflictDoNothing({ target: users.email });
		const user = await locals.db.select().from(users).where(eq(users.email, email)).get();
		if (!user) error(500);
		if (user.suspendedAt) return fail(403, { message: SUSPENDED_MESSAGE });

		const { token, expiresAt } = await createSession(locals.db, user.id);
		setSessionCookie(cookies, token, expiresAt);

		const hasPasskey = await locals.db
			.select({ id: passkeys.id })
			.from(passkeys)
			.where(eq(passkeys.userId, user.id))
			.get();
		// Until the nickname, passkey and はじめの設定 are done, `next` waits for the home page.
		redirect(303, user.nickname && hasPasskey ? (user.setupAt ? (takeNext(cookies) ?? '/') : '/setup') : '/welcome');
	}
};
