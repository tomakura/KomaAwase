import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { passkeys } from '$lib/server/db/schema';
import { finishGoogle, googleEnabled, userForGoogle } from '$lib/server/auth/google';
import { takeNext } from '$lib/server/auth/next';
import { signIn } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url, cookies, locals, request }) => {
	if (!platform || !googleEnabled(platform.env)) redirect(303, '/login');
	let account;
	try {
		account = await finishGoogle(platform.env, url, cookies);
	} catch (e) {
		console.error('google sign-in failed', e);
	}
	if (!account) redirect(303, '/login?error=google');

	const user = await userForGoogle(locals.db, account);
	if (user === 'use-mail') redirect(303, '/login?error=google-mail');
	if (!user) redirect(303, '/login?error=google');
	await signIn(locals.db, cookies, request, user.id);

	const hasPasskey = await locals.db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.id)).get();
	// As after the sign-in mail: finish the nickname, passkey and はじめの設定 first.
	redirect(303, user.nickname && hasPasskey ? (user.setupAt ? (takeNext(cookies) ?? '/') : '/setup') : '/welcome');
};
