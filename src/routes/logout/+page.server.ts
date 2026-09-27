import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) await deleteSession(locals.db, token);
		clearSessionCookie(cookies);
		redirect(303, '/login');
	}
};
