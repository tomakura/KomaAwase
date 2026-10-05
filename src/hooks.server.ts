import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { METRICS, countMetric } from '$lib/server/metrics';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie, validateSession } from '$lib/server/auth/session';
import { SECURITY_HEADERS } from '$lib/security';
import { themeColorTags } from '$lib/theme';
import { academicYear, tokyoTime } from '$lib/time';

// On every response (src/lib/security.ts). The Content-Security-Policy for pages is SvelteKit's
// (the csp option in vite.config.ts).
function secured(response: Response) {
	// A response passed through from fetch() can't be changed, so it's copied first
	try {
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) copy.headers.set(key, value);
		return copy;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// The app's check that the server answers (src/lib/connection.svelte.ts), while its
	// connection is poor. Answered before the database and the session are read.
	if (event.url.pathname === '/api/ping') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

	const d1 = event.platform?.env.DB;
	if (!d1) throw new Error('D1 binding "DB" is missing');
	event.locals.db = getDb(d1);
	event.locals.user = null;
	event.locals.session = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		// This year's timetable comes along for pages. Form posts leave it out: an action
		// may change it before the page's load runs in the same request.
		const year = event.request.method === 'GET' ? academicYear(tokyoTime(Date.now()).date) : null;
		const result = await validateSession(event.locals.db, token, year);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			event.locals.timetable = result.timetable;
			setSessionCookie(event.cookies, token, result.expiresAt);
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	// The theme is in the HTML from the start, so a dark page never flashes light.
	const theme = event.locals.user?.theme ?? 'system';
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%koma.theme%', theme).replace('%koma.themeColor%', themeColorTags(theme))
	});
	// Counted for 運営 → 数字 and /status, never with who or which page
	if (response.status >= 500 && event.platform) event.platform.ctx.waitUntil(countMetric(d1, METRICS.serverErrors));
	return secured(response);
};
