import { eq } from 'drizzle-orm';
import { ICON_TEXT_MAX, isIconColor, isIconText, type IconColor } from '$lib/icons';
import type { Db } from './db';
import { users, type UserIcon } from './db/schema';
import { photoFromDataUrl, setPhoto } from './photos';

export type IconInput = { text: string; color: IconColor; photo: string | null };

/** The letters, color and photo the icon form sent, or the message to show */
export function readIcon(form: FormData): IconInput | { message: string } {
	const text = String(form.get('text') ?? '').trim();
	const color = String(form.get('color') ?? '');
	if (!isIconText(text)) return { message: `アイコンの文字は空白なしの1〜${ICON_TEXT_MAX}文字で入れてください` };
	if (!isIconColor(color)) return { message: '色を選んでください' };
	const sent = String(form.get('photo') ?? '');
	if (!sent) return { text, color, photo: null };
	const photo = photoFromDataUrl(sent);
	if (!photo) return { message: '写真を読み込めませんでした。別の写真でやり直してください' };
	return { text, color, photo };
}

/** Saves the letters and color, and a newly framed photo when there is one; a photo already set stays. */
export async function saveIcon(
	db: Db,
	user: { id: string; nickname: string | null; icon: UserIcon | null },
	icon: IconInput
) {
	const { text, color, photo } = icon;
	if (photo) {
		await setPhoto(db, user, photo, { color, text });
		return;
	}
	// The letters show while the photo loads
	const kept = user.icon?.photo;
	await db
		.update(users)
		.set({ icon: { color, text, ...(kept ? { photo: kept } : {}) } })
		.where(eq(users.id, user.id));
}
