import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { sessions } from '$lib/server/db/schema';

const MINUTE = 60 * 1000;

// What asks to sign in again first: leaving the app, and the admin pages
export const REAUTH = {
	delete: { lead: '退会する前に、もう一度ログインしてください。', back: '/more' },
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
