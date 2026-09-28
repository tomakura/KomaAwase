import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie, validateSession } from '$lib/server/auth/session';
import { themeColorTags } from '$lib/theme';

export const handle: Handle = async ({ event, resolve }) => {
	const d1 = event.platform?.env.DB;
	if (!d1) throw new Error('D1 binding "DB" is missing');
	event.locals.db = getDb(d1);
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const result = await validateSession(event.locals.db, token);
		if (result) {
			event.locals.user = result.user;
			setSessionCookie(event.cookies, token, result.expiresAt);
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
