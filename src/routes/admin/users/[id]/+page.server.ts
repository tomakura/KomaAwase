import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { deleteAccount } from '$lib/server/account';
import { users } from '$lib/server/db/schema';
import { readWarning } from '$lib/moderation';
import { deletePhoto, loadUser, resetNickname, resumeUser, sendWarning, suspendUser } from '$lib/server/moderation';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	const user = await loadUser(locals.db, params.id);
	if (!user) error(404, '利用者が見つかりません');
	return { user };
};

/** The person to act on: an admin's own account is never touched from here */
async function target({ locals, params }: RequestEvent<{ id: string }>) {
	const admin = requireAdmin(locals);
	const row = await locals.db.select().from(users).where(eq(users.id, params.id)).get();
	if (!row) error(404, '利用者が見つかりません');
	if (row.role === 'admin') error(400, '運営の人には使えません');
	return { admin, row };
}

export const actions: Actions = {
	warn: async (event) => {
		const { admin, row } = await target(event);
		const warning = readWarning((await event.request.formData()).get('body'));
		if ('message' in warning) return fail(400, { message: warning.message });
		await sendWarning(event.locals.db, admin.id, row.id, warning.body);
		return { warned: true };
	},
	suspend: async (event) => {
		const { row } = await target(event);
		await suspendUser(event.locals.db, row.id);
	},
	resume: async (event) => {
		const { row } = await target(event);
		await resumeUser(event.locals.db, row.id);
	},
	nickname: async (event) => {
		const { row } = await target(event);
		await resetNickname(event.locals.db, row.id);
	},
	photo: async (event) => {
		const { row } = await target(event);
		await deletePhoto(event.locals.db, row);
	},
	// A few rounds for the files; the button can be pressed again for the rest
	remove: async (event) => {
		const { row } = await target(event);
		if (!event.platform) error(500);
		try {
			for (let i = 0; i < 5; i++) {
				if ((await deleteAccount(event.platform.env, event.locals.db, row.id)) === 'done') redirect(303, '/admin/users');
			}
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			console.error('account deletion failed', e);
			return fail(502, { message: '資料のファイルを消せませんでした。時間をおいてもう一度やり直してください' });
		}
		return fail(202, { message: '資料のファイルがまだ残っています。もう一度押してください' });
	}
};
