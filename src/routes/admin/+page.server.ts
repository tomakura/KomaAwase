import { count, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { contactMessages, feedback, reports } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

// The way in to what whoever runs the app looks after: users with role 'admin', set in D1 by hand
// (`update users set role = 'admin' where email = '…'`). Each thing has its own page.
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const [[r], [f], [c]] = await locals.db.batch([
		locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
		locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open')),
		locals.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'open'))
	]);
	return { reports: r?.n ?? 0, feedback: f?.n ?? 0, contact: c?.n ?? 0 };
};
