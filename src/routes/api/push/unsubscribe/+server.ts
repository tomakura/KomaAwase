import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { pushSubscriptions } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// This browser stops receiving notifications
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof body?.endpoint !== 'string') error(400);
	await locals.db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, locals.user.id)));
	return json({ ok: true });
};
