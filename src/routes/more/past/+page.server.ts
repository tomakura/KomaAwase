import { redirect } from '@sveltejs/kit';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { courses, timetables, universities } from '$lib/server/db/schema';
import { thisYear } from '$lib/server/setup';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const rows = await locals.db
		.select({
			id: timetables.id,
			year: timetables.year,
			university: universities.name,
			courses: count(courses.id)
		})
		.from(timetables)
		.leftJoin(universities, eq(universities.id, timetables.universityId))
		.leftJoin(courses, eq(courses.timetableId, timetables.id))
		.where(and(eq(timetables.userId, locals.user.id), lt(timetables.year, thisYear())))
		.groupBy(timetables.id)
		.orderBy(desc(timetables.year));
	return { timetables: rows };
};
