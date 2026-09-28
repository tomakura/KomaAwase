import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { userPhotos } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// An icon photo, for signed-in people only. The address carries ?v=<when it was set>, so
// the browser keeps it for good and a new photo comes under a new address.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(404, 'Not found');
	const row = await locals.db.select({ jpeg: userPhotos.jpeg }).from(userPhotos).where(eq(userPhotos.userId, params.id)).get();
	if (!row) error(404, 'Not found');
	const bytes = Uint8Array.from(atob(row.jpeg), (c) => c.charCodeAt(0));
	return new Response(bytes, {
		headers: {
			'content-type': 'image/jpeg',
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
