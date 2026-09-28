import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { passkeys } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const NAME_MAX = 30;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const rows = await locals.db
		.select({
			id: passkeys.id,
			name: passkeys.name,
			backedUp: passkeys.backedUp,
			createdAt: passkeys.createdAt,
			lastUsedAt: passkeys.lastUsedAt
		})
		.from(passkeys)
		.where(eq(passkeys.userId, locals.user.id))
		.orderBy(desc(passkeys.createdAt));
	return { passkeys: rows };
};

export const actions: Actions = {
	rename: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name || [...name].length > NAME_MAX) return fail(400, { message: `名前は1〜${NAME_MAX}文字で入れてください` });
		await locals.db
			.update(passkeys)
			.set({ name })
			.where(and(eq(passkeys.id, String(form.get('id'))), eq(passkeys.userId, locals.user.id)));
		return { renamed: true };
	},
	remove: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const id = String((await request.formData()).get('id'));
		await locals.db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, locals.user.id)));
	}
};
