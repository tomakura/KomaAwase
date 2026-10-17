import { redirect, type Cookies } from '@sveltejs/kit';

// Where to go after signing in: a friend's link or a group invite opened while signed out.
// It waits in a cookie through the email link, はじめの設定 and the rest (the enrollment mail can
// take a while to be opened, so it keeps for a day).
const NEXT_COOKIE = 'next';

const BASE = 'https://koma.invalid';

// Only paths on this site, never //other.example or /\other.example. The value is read the
// way a browser reads it (tabs and newlines dropped, \ as /), so /%09/other.example can't
// slip through either, and the path comes back in that read form.
export function safeNext(value: string | null | undefined) {
	if (!value?.startsWith('/')) return null;
	try {
		const url = new URL(value, BASE);
		return url.origin === BASE ? url.pathname + url.search + url.hash : null;
	} catch {
		return null;
	}
}

export function rememberNext(cookies: Cookies, value: string | null) {
	const next = safeNext(value);
	if (next) cookies.set(NEXT_COOKIE, next, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 });
	return next;
}

export function takeNext(cookies: Cookies) {
	const next = safeNext(cookies.get(NEXT_COOKIE));
	if (next) cookies.delete(NEXT_COOKIE, { path: '/' });
	return next;
}

// Where to go after signing in again (the admin pages, leaving the app). Kept apart from `next`,
// which the home page follows: someone who backs out of signing in again must not be sent there
// later. Only the sign-in itself reads it, and it doesn't outlast the sign-in mail.
const REAUTH_NEXT_COOKIE = 'reauth_next';

export function rememberReauthNext(cookies: Cookies, value: string | null) {
	const next = safeNext(value);
	if (next) cookies.set(REAUTH_NEXT_COOKIE, next, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 });
	else cookies.delete(REAUTH_NEXT_COOKIE, { path: '/' });
	return next;
}

/** Where a finished sign-in goes: back to what asked to sign in again, or else `next`. */
export function takeSignInNext(cookies: Cookies) {
	const again = safeNext(cookies.get(REAUTH_NEXT_COOKIE));
	if (again) {
		cookies.delete(REAUTH_NEXT_COOKIE, { path: '/' });
		return again;
	}
	return takeNext(cookies);
}

// Where to go back to once the link in an enrollment mail is opened: the page that suggested
// the check. Kept apart from `next`, which the home page follows as soon as it loads. The mail
// relay takes only bare links, so this can't ride in the link and works in the same browser.
const VERIFY_NEXT_COOKIE = 'verify_next';

export function rememberVerifyNext(cookies: Cookies, value: string | null) {
	const next = safeNext(value);
	if (next) cookies.set(VERIFY_NEXT_COOKIE, next, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 });
	else cookies.delete(VERIFY_NEXT_COOKIE, { path: '/' });
}

export function takeVerifyNext(cookies: Cookies) {
	const next = safeNext(cookies.get(VERIFY_NEXT_COOKIE));
	if (next) cookies.delete(VERIFY_NEXT_COOKIE, { path: '/' });
	return next;
}

/** The signed-in user, or a redirect to sign in that comes back to this page. */
export function requireUser(locals: App.Locals, url: URL) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return locals.user;
}
