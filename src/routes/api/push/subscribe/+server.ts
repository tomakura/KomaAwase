import { error, json } from '@sveltejs/kit';
import { and, count, eq, ne } from 'drizzle-orm';
import { pushSubscriptions } from '$lib/server/db/schema';
import { pushEnabled } from '$lib/server/notify';
import { isPushEndpoint } from '$lib/server/push';
import type { RequestHandler } from './$types';

// Phones, tablets and computers; a few more than anyone needs
const DEVICES_MAX = 10;
const KEY = /^[A-Za-z0-9_-]{16,200}$/;

// This browser's push subscription (PushSubscription.toJSON()), kept for the signed-in user
export const POST: RequestHandler = async ({ locals, request, url, platform }) => {
	if (!locals.user) error(401, 'ログインしてください');
	// Only this site's pages may send (SvelteKit checks this for forms, not for fetch).
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	if (!pushEnabled(platform?.env)) error(404, 'Not found');
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
	const endpoint = body?.endpoint;
	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;
	if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isPushEndpoint(endpoint)) error(400, 'この端末では通知を受け取れません');
	if (typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY.test(p256dh) || !KEY.test(auth)) error(400, 'この端末では通知を受け取れません');

	// This browser registering again doesn't count against itself
	const [mine] = await locals.db
		.select({ n: count() })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, locals.user.id), ne(pushSubscriptions.endpoint, endpoint)));
	if ((mine?.n ?? 0) >= DEVICES_MAX) {
		return json({ message: `通知を受け取れる端末は${DEVICES_MAX}台までです。使っていない端末で通知をオフにしてください` }, { status: 400 });
	}
	// The same browser signing in as someone else moves over to them. It stays with this
	// session, so logging this device out stops it.
	const sessionId = locals.session?.id ?? null;
	await locals.db
		.insert(pushSubscriptions)
		.values({ userId: locals.user.id, endpoint, p256dh, auth, sessionId })
		.onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: locals.user.id, p256dh, auth, sessionId } });
	return json({ ok: true });
};
