import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { userPhotos } from '$lib/server/db/schema';
import { canSeePhoto } from '$lib/server/friends';
import type { RequestHandler } from './$types';

// An icon photo, for the people who may see it (canSeePhoto); anyone else gets a 404 and the
// page shows the letters. The address carries ?v=<when it was set>, so a new photo comes under
// a new address. The browser keeps it for a day only, so it goes once a friend is removed.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || !(await canSeePhoto(locals.db, locals.user.id, params.id))) error(404, 'Not found');
	const row = await locals.db.select({ jpeg: userPhotos.jpeg }).from(userPhotos).where(eq(userPhotos.userId, params.id)).get();
	if (!row) error(404, 'Not found');
	const bytes = Uint8Array.from(atob(row.jpeg), (c) => c.charCodeAt(0));
	return new Response(bytes, {
		headers: {
			'content-type': 'image/jpeg',
			'cache-control': 'private, max-age=86400',
			'x-content-type-options': 'nosniff'
		}
	});
};
