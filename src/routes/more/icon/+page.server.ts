import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { ICON_TEXT_MAX, isIconColor, splitGraphemes } from '$lib/icons';
import { users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { id, nickname, icon } = locals.user;
	return { user: { id, nickname, icon } };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const text = String(form.get('text') ?? '').trim();
		const color = String(form.get('color') ?? '');
		const chars = splitGraphemes(text);
		// Graphemes can be long (family emoji), so the code units are capped too.
		if (!chars.length || chars.length > ICON_TEXT_MAX || text.length > 16) {
			return fail(400, { message: `アイコンの文字は1〜${ICON_TEXT_MAX}文字で入れてください` });
		}
		if (!isIconColor(color)) return fail(400, { message: '色を選んでください' });
		await locals.db.update(users).set({ icon: { color, text } }).where(eq(users.id, locals.user.id));
		redirect(303, '/more');
	}
};
