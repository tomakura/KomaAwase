import { redirect } from '@sveltejs/kit';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { deviceName } from '$lib/device';
import { endOtherSessions, endSessions } from '$lib/server/auth/session';
import { sessions } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// ログイン中の端末: where this account is signed in, to log out a lost or old device
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const rows = await locals.db
		.select({ id: sessions.id, userAgent: sessions.userAgent, lastUsedAt: sessions.lastUsedAt, createdAt: sessions.createdAt })
		.from(sessions)
		.where(and(eq(sessions.userId, locals.user.id), gt(sessions.expiresAt, new Date())))
		.orderBy(desc(sessions.lastUsedAt));
	const current = locals.session?.id;
	return {
		sessions: rows
			.map((r) => ({
				id: r.id,
				name: deviceName(r.userAgent),
				lastUsedAt: r.lastUsedAt?.getTime() ?? null,
				current: r.id === current
			}))
			// This device first
			.sort((a, b) => Number(b.current) - Number(a.current))
	};
};

export const actions: Actions = {
	end: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const id = String((await request.formData()).get('id') ?? '');
		// This device logs out from the logout button instead
		const row = await locals.db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.id, id), eq(sessions.userId, locals.user.id), ne(sessions.id, locals.session?.id ?? '')))
			.get();
		if (row) await endSessions(locals.db, [row.id]);
	},
	endOthers: async ({ locals }) => {
		if (!locals.user) redirect(303, '/login');
		await endOtherSessions(locals.db, locals.user.id, locals.session?.id);
		return { ended: true };
	}
};
