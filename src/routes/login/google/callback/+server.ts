import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { passkeys, users } from '$lib/server/db/schema';
import { finishGoogle, googleEnabled, userForGoogle } from '$lib/server/auth/google';
import { takeSignInNext } from '$lib/server/auth/next';
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
	if (user.suspendedAt) redirect(303, '/login?error=suspended');
	// For the enrollment check by the sign-in (verifyBySignIn), which goes by how recent this is. Only
	// for the Google account linked to it: one found by its address may be linked to another
	await locals.db
		.update(users)
		.set({ googleAt: new Date() })
		.where(and(eq(users.id, user.id), eq(users.googleSub, account.sub)));
	await signIn(locals.db, cookies, request, user.id);

	const hasPasskey = await locals.db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.id)).get();
	// As after the sign-in mail: finish the nickname, passkey and はじめの設定 first.
	redirect(303, user.nickname && hasPasskey ? (user.setupAt ? (takeSignInNext(cookies) ?? '/') : '/setup') : '/welcome');
};
