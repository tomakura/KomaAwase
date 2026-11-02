import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { sessions } from '$lib/server/db/schema';

const MINUTE = 60 * 1000;

// What asks to sign in again first: leaving the app, adding a passkey, and the admin pages
export const REAUTH = {
	delete: { lead: '本人確認のため、もう一度ログインしてください。', back: '/more/account' },
	passkey: { lead: 'パスキーを追加する前に、もう一度ログインしてください。', back: '/more/passkeys' },
	admin: { lead: '運営の画面を開く前に、もう一度ログインしてください。', back: '/more' }
} as const;
export type Reauth = keyof typeof REAUTH;

export const readReauth = (value: string | null): Reauth | null => (value && value in REAUTH ? (value as Reauth) : null);

export const reauthHref = (purpose: Reauth, next: string) => `/login?reauth=${purpose}&next=${encodeURIComponent(next)}`;

/** Whether the person signed in on this session within the last `ms` */
export function signedInWithin(locals: App.Locals, ms: number, now = Date.now()) {
	const at = locals.session?.authedAt;
	return !!at && now - at.getTime() < ms;
}

/**
 * Adding a passkey: only within this long of signing in (on はじめの設定, that is right after
 * signing up), so a session taken from someone can't add a way in of its own that outlasts it.
 */
export const PASSKEY_ADD_WINDOW = 10 * MINUTE;
// The passkey prompt itself can take a while, so the second half allows a little more
export const PASSKEY_VERIFY_WINDOW = 15 * MINUTE;
export const PASSKEY_REAUTH_MESSAGE = 'パスキーを追加するには、もう一度ログインしてください';

// A form post comes back to the page, not to the action
const here = (url: URL) => (url.search.startsWith('?/') ? url.pathname : url.pathname + url.search);

/**
 * The account deletion page: only right after signing in again. The link to it always goes
 * through the sign-in, so each visit asks; this catches the page opened any other way.
 */
export function requireRecentSignIn(locals: App.Locals, url: URL, purpose: Reauth, ms = 10 * MINUTE) {
	if (!locals.user) redirect(303, '/login');
	if (!signedInWithin(locals, ms)) redirect(303, reauthHref(purpose, here(url)));
	return locals.user;
}

// Idle this long on the admin pages, and they ask to sign in again
const ADMIN_IDLE = 10 * MINUTE;

/**
 * Whoever runs the app (role 'admin', set in D1 by hand), signed in again when opening the
 * admin pages and after 10 minutes without using them. Each use keeps it going.
 */
export async function requireAdmin(locals: App.Locals, url: URL) {
	if (locals.user?.role !== 'admin' || !locals.session) error(404, 'Not found');
	if (!signedInWithin(locals, ADMIN_IDLE)) redirect(303, reauthHref('admin', here(url)));
	const at = locals.session.authedAt!.getTime();
	if (Date.now() - at > MINUTE) {
		await locals.db.update(sessions).set({ authedAt: new Date() }).where(eq(sessions.id, locals.session.id));
	}
	return locals.user;
}
