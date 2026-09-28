import { eq } from 'drizzle-orm';
import { PHOTO_MAX_BYTES, iconOf } from '$lib/icons';
import type { Db } from './db';
import { userPhotos, users, type UserIcon } from './db/schema';

const PREFIX = 'data:image/jpeg;base64,';

/** The base64 of a JPEG the icon page sent, or null when it isn't one or is too big */
export function photoFromDataUrl(value: string) {
	if (!value.startsWith(PREFIX)) return null;
	const base64 = value.slice(PREFIX.length);
	if ((base64.length * 3) / 4 > PHOTO_MAX_BYTES + 3 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
	let bytes: string;
	try {
		bytes = atob(base64);
	} catch {
		return null;
	}
	// A JPEG starts with FF D8 FF
	if (bytes.charCodeAt(0) !== 0xff || bytes.charCodeAt(1) !== 0xd8 || bytes.charCodeAt(2) !== 0xff) return null;
	return base64;
}

type Owner = { id: string; nickname: string | null; icon: UserIcon | null };

// The letters and color stay, for while the photo loads or if it can't
function lettersOf(user: Owner) {
	const { color, text } = iconOf(user);
	return { color, text };
}

export async function setPhoto(db: Db, user: Owner, base64: string) {
	const now = new Date();
	await db.batch([
		db
			.insert(userPhotos)
			.values({ userId: user.id, jpeg: base64, updatedAt: now })
			.onConflictDoUpdate({ target: userPhotos.userId, set: { jpeg: base64, updatedAt: now } }),
		db
			.update(users)
			.set({ icon: { ...lettersOf(user), photo: now.getTime() } })
			.where(eq(users.id, user.id))
	]);
}

export async function removePhoto(db: Db, user: Owner) {
	await db.batch([
		db.delete(userPhotos).where(eq(userPhotos.userId, user.id)),
		db
			.update(users)
			.set({ icon: user.icon ? lettersOf(user) : null })
			.where(eq(users.id, user.id))
	]);
}
