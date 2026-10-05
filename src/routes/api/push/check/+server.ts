import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { pushSubscriptions } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// 通知 → 届かないときは: whether this browser's subscription is registered for the user, and
// when a notification last reached it or last didn't. The browser sends its own endpoint; none
// is ever sent back.
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	const endpoint = body?.endpoint;
	if (typeof endpoint !== 'string' || endpoint.length > 1000) error(400);
	const row = await locals.db
		.select({ lastOkAt: pushSubscriptions.lastOkAt, lastFailedAt: pushSubscriptions.lastFailedAt })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, locals.user.id), eq(pushSubscriptions.endpoint, endpoint)))
		.get();
	return json({
		registered: !!row,
		lastOkAt: row?.lastOkAt?.getTime() ?? null,
		lastFailedAt: row?.lastFailedAt?.getTime() ?? null
	});
};
