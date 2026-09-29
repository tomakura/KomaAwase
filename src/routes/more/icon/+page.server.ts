import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { ICON_TEXT_MAX, isIconColor, isIconText } from '$lib/icons';
import { users } from '$lib/server/db/schema';
import { photoFromDataUrl, removePhoto, setPhoto } from '$lib/server/photos';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { id, nickname, icon } = locals.user;
	return { user: { id, nickname, icon } };
};

export const actions: Actions = {
	// The letters, the color and a newly framed photo (when there is one) are saved together
	save: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const text = String(form.get('text') ?? '').trim();
		const color = String(form.get('color') ?? '');
		if (!isIconText(text)) {
			return fail(400, { message: `アイコンの文字は空白なしの1〜${ICON_TEXT_MAX}文字で入れてください` });
		}
		if (!isIconColor(color)) return fail(400, { message: '色を選んでください' });
		const sent = String(form.get('photo') ?? '');
		if (sent) {
			const base64 = photoFromDataUrl(sent);
			if (!base64) return fail(400, { message: '写真を読み込めませんでした。別の写真でお試しください' });
			await setPhoto(locals.db, locals.user, base64, { color, text });
		} else {
			// The photo already set stays; the letters show while it loads
			const photo = locals.user.icon?.photo;
			await locals.db
				.update(users)
				.set({ icon: { color, text, ...(photo ? { photo } : {}) } })
				.where(eq(users.id, locals.user.id));
		}
		redirect(303, '/more');
	},
	removePhoto: async ({ locals }) => {
		if (!locals.user) redirect(303, '/login');
		await removePhoto(locals.db, locals.user);
		return { removed: true };
	}
};
