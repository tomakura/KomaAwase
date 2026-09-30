import { redirect } from '@sveltejs/kit';
import { takeNext } from '$lib/server/auth/next';
import { unreviewedImport } from '$lib/server/import/jobs';
import { getOrCreateTimetable, loadTimetable } from '$lib/server/timetable';
import { sharedAccess } from '$lib/server/verify';
import { academicYear, tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.nickname) redirect(303, '/welcome');
	if (!locals.user.setupAt) redirect(303, '/setup');
	const next = takeNext(cookies);
	if (next) redirect(303, next);
	// Passed down so the first render in the browser matches the server's.
	const now = Date.now();
	const today = tokyoTime(now).date;
	const timetable = await getOrCreateTimetable(locals.db, locals.user, academicYear(today), locals.timetable);
	const [loaded, imported, access] = await Promise.all([
		loadTimetable(locals.db, timetable.id, today, locals.user.id),
		unreviewedImport(locals.db, locals.user.id),
		sharedAccess(locals.db, locals.user.id, timetable.universityId)
	]);
	return {
		now,
		termParam: url.searchParams.get('term'),
		year: timetable.year,
		days: locals.user.daysShown,
		imported: imported ?? null,
		// Whether searching and importing screenshots can be offered (they need an enrollment check)
		access,
		...loaded
	};
};
