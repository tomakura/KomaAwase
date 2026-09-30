import type { Handle } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie, validateSession } from '$lib/server/auth/session';
import { themeColorTags } from '$lib/theme';
import { academicYear, tokyoTime } from '$lib/time';

const LAST_SEEN_EVERY = 6 * 60 * 60 * 1000;

export const handle: Handle = async ({ event, resolve }) => {
	// The app's check that the server answers (src/lib/connection.svelte.ts), while its
	// connection is poor. Answered before the database and the session are read.
	if (event.url.pathname === '/api/ping') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

	const d1 = event.platform?.env.DB;
	if (!d1) throw new Error('D1 binding "DB" is missing');
	event.locals.db = getDb(d1);
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		// This year's timetable comes along for pages. Form posts leave it out: an action
		// may change it before the page's load runs in the same request.
		const year = event.request.method === 'GET' ? academicYear(tokyoTime(Date.now()).date) : null;
		const result = await validateSession(event.locals.db, token, year);
		if (result) {
			event.locals.user = result.user;
			event.locals.timetable = result.timetable;
			setSessionCookie(event.cookies, token, result.expiresAt);
			// When the app was last opened, for the admin's list: a page load at most every few hours
			const seen = result.user.lastSeenAt?.getTime() ?? 0;
			if (event.request.method === 'GET' && Date.now() - seen > LAST_SEEN_EVERY) {
				const update = event.locals.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, result.user.id));
				if (event.platform) event.platform.ctx.waitUntil(update.then(() => {}, () => {}));
			}
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	// The theme is in the HTML from the start, so a dark page never flashes light.
	const theme = event.locals.user?.theme ?? 'system';
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%koma.theme%', theme).replace('%koma.themeColor%', themeColorTags(theme))
	});
};
