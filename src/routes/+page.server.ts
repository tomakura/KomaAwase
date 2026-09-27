import { redirect } from '@sveltejs/kit';
import { getOrCreateTimetable, loadTimetable } from '$lib/server/timetable';
import { academicYear, tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.nickname) redirect(303, '/welcome');
	// Passed down so the first render in the browser matches the server's.
	const now = Date.now();
	const timetable = await getOrCreateTimetable(
		locals.db,
		locals.user.id,
		academicYear(tokyoTime(now).date)
	);
	return {
		now,
		termParam: url.searchParams.get('term'),
		year: timetable.year,
		days: locals.user.daysShown,
		...(await loadTimetable(locals.db, timetable.id))
	};
};
