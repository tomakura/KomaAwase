import { error } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { feedback, reports } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

// The way in to what whoever runs the app looks after: users with role 'admin', set in D1 by hand
// (`update users set role = 'admin' where email = '…'`). Each thing has its own page.
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	const [[r], [f]] = await locals.db.batch([
		locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
		locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open'))
	]);
	return { reports: r?.n ?? 0, feedback: f?.n ?? 0 };
};
