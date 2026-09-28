import { redirect, type Cookies } from '@sveltejs/kit';

// Where to go after signing in: a friend's link or a group invite opened while signed out.
// It waits in a cookie through the email link, はじめの設定 and the rest.
const NEXT_COOKIE = 'next';

// Only paths on this site, never //other.example or /\other.example
export function safeNext(value: string | null | undefined) {
	return value && /^\/(?![/\\])/.test(value) ? value : null;
}

export function rememberNext(cookies: Cookies, value: string | null) {
	const next = safeNext(value);
	if (next) cookies.set(NEXT_COOKIE, next, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 });
	return next;
}

export function takeNext(cookies: Cookies) {
	const next = safeNext(cookies.get(NEXT_COOKIE));
	if (next) cookies.delete(NEXT_COOKIE, { path: '/' });
	return next;
}

/** The signed-in user, or a redirect to sign in that comes back to this page. */
export function requireUser(locals: App.Locals, url: URL) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return locals.user;
}
