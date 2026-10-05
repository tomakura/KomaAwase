import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { courses, timetables } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// From the notification that a shared course changed: the person's own class that syncs it
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/login');
	const own = await locals.db
		.select({ id: courses.id })
		.from(courses)
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.where(and(eq(courses.sharedCourseId, params.sharedId), eq(timetables.userId, locals.user.id)))
		.orderBy(desc(timetables.year))
		.get();
	if (!own) error(404, '授業が見つかりません');
	redirect(303, `/courses/${own.id}`);
};
