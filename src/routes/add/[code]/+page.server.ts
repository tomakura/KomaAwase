import { error, fail, redirect } from '@sveltejs/kit';
import { rememberNext, requireUser } from '$lib/server/auth/next';
import { findByFriendCode, friendshipBetween, isBlocked, readCode, sendRequest } from '$lib/server/friends';
import { verifiedIds } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

async function target(db: App.Locals['db'], code: string) {
	const valid = readCode(code);
	const person = valid ? await findByFriendCode(db, valid) : undefined;
	if (!person) error(404, 'このリンクは使えません。作り直されたか、まちがっているかもしれません');
	return person;
}

// Someone's friend link: who they are, and a button to ask
export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	const me = requireUser(locals, url);
	// Onboarding first; the home page brings them back here after はじめの設定.
	if (!me.setupAt) {
		rememberNext(cookies, url.pathname);
		redirect(303, '/');
	}
	const found = await target(locals.db, params.code);
	const person = { ...found, verified: (await verifiedIds(locals.db, [found.id])).has(found.id) };
	if (person.id === me.id) return { person, state: 'self' as const };
	const [friendship, blocked] = await Promise.all([
		friendshipBetween(locals.db, me.id, person.id),
		isBlocked(locals.db, me.id, person.id)
	]);
	const state = blocked
		? ('unavailable' as const)
		: friendship?.status === 'accepted'
			? ('friends' as const)
			: friendship
				? friendship.requesterId === me.id
					? ('pending' as const)
					: ('asked' as const)
				: ('none' as const);
	return { person, state };
};

const MESSAGES = {
	sent: null,
	accepted: null,
	friends: null,
	pending: null,
	unavailable: '申請できませんでした',
	limit: '返事を待っている申請が多すぎます。承認されるか、取り消してからもう一度お試しください'
};

export const actions: Actions = {
	default: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		const person = await target(locals.db, params.code);
		const result = await sendRequest(locals.db, me.id, person.id);
		const message = MESSAGES[result];
		if (message) return fail(400, { message });
		return { result };
	}
};
