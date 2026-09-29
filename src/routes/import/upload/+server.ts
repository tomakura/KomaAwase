import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { importJobs } from '$lib/server/db/schema';
import { createImportJob, enqueue } from '$lib/server/import/jobs';
import { currentTimetable } from '$lib/server/timetable';
import type { RequestHandler } from './$types';

// The cropped screenshot, already a JPEG data URL made in the browser, so the Worker
// spends no time encoding it.
export const POST: RequestHandler = async ({ locals, request, platform, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	// Only this site's pages may send (SvelteKit checks this for forms, not for fetch).
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	if (!platform) error(500);
	const body = (await request.json().catch(() => null)) as { image?: unknown; tiled?: unknown } | null;
	if (typeof body?.image !== 'string') error(400, '画像を読み込めませんでした');

	const timetable = await currentTimetable(locals.db, locals.user);
	const created = await createImportJob(locals.db, locals.user.id, timetable.id, body.image, body.tiled === true);
	if ('message' in created) return json({ message: created.message }, { status: 400 });
	try {
		// No queue consumer runs under `npm run dev`, so the screenshot is read in the background here.
		await enqueue(platform.env, platform.ctx, locals.db, created.id, dev);
	} catch (e) {
		console.error('import enqueue failed', e);
		// Out of line it would only hold one of the user's places, so it goes (and isn't counted).
		await locals.db.delete(importJobs).where(eq(importJobs.id, created.id));
		return json({ message: '混み合っています。少し待ってからもう一度お試しください' }, { status: 503 });
	}
	return json({ id: created.id });
};
