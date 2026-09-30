import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { pushSubscriptions } from '$lib/server/db/schema';
import { safeNext } from '$lib/server/auth/next';
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ locals, cookies, request }) => {
		// This browser's notifications stop too: the page sends its subscription (and drops it
		// on its side). Ones turned on in this session go with it either way.
		const form = await request.formData();
		const endpoint = form.get('endpoint');
		if (locals.user && typeof endpoint === 'string' && endpoint) {
			await locals.db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, locals.user.id)));
		}
		const token = cookies.get(SESSION_COOKIE);
		if (token) await deleteSession(locals.db, token);
		clearSessionCookie(cookies);
		// A page that asked to sign in as someone else (an enrollment link) comes back after
		const next = safeNext(String(form.get('next') ?? ''));
		redirect(303, next ? `/login?next=${encodeURIComponent(next)}` : '/login');
	}
};
