import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { userPhotos } from '$lib/server/db/schema';
import { canSeePhoto } from '$lib/server/friends';
import type { RequestHandler } from './$types';

// An icon photo, for the people who may see it (canSeePhoto); anyone else gets a 404 and the
// page shows the letters. The address carries ?v=<when it was set>, so a new photo comes under
// a new address. The browser asks again each time it shows one (no-cache), so a photo goes as
// soon as a friend is removed or another account signs in; while it may still be seen, the
// answer is a short 304 by its ETag.
export const GET: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user || !(await canSeePhoto(locals.db, locals.user.id, params.id))) error(404, 'Not found');
	const row = await locals.db
		.select({ jpeg: userPhotos.jpeg, updatedAt: userPhotos.updatedAt })
		.from(userPhotos)
		.where(eq(userPhotos.userId, params.id))
		.get();
	if (!row) error(404, 'Not found');
	const headers = {
		'cache-control': 'private, no-cache',
		etag: `"${row.updatedAt.getTime()}"`,
		vary: 'cookie',
		'x-content-type-options': 'nosniff'
	};
	if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers });
	const bytes = Uint8Array.from(atob(row.jpeg), (c) => c.charCodeAt(0));
	return new Response(bytes, { headers: { ...headers, 'content-type': 'image/jpeg' } });
};
