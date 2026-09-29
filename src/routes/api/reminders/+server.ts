import { error, json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { REMINDER_DEFAULT } from '$lib/reminder';
import { classReminders, pushSubscriptions } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// How many times before a class this person chose, and how many of their devices receive
// notifications. The screen that suggests turning notifications on asks, to tell someone who
// has none from someone who has (on this device or another).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'ログインしてください');
	const [[row], [devices]] = await locals.db.batch([
		locals.db.select({ n: count() }).from(classReminders).where(eq(classReminders.userId, locals.user.id)),
		locals.db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, locals.user.id))
	]);
	return json({ count: row?.n ?? 0, devices: devices?.n ?? 0 });
};

// Turns on the usual time (REMINDER_DEFAULT) for someone who has none; nothing to those who chose
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	// Only this site's pages may ask (SvelteKit checks this for forms, not for fetch).
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	const [row] = await locals.db.select({ n: count() }).from(classReminders).where(eq(classReminders.userId, locals.user.id));
	if (!row?.n) {
		await locals.db.insert(classReminders).values({ userId: locals.user.id, minutes: REMINDER_DEFAULT }).onConflictDoNothing();
	}
	return json({ ok: true });
};
