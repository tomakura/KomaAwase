import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { timetables } from '$lib/server/db/schema';
import { loadTimetable } from '$lib/server/timetable';
import { tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

// A past year's timetable, to look back on
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await locals.db
		.select({ id: timetables.id, year: timetables.year })
		.from(timetables)
		.where(and(eq(timetables.id, params.id), eq(timetables.userId, locals.user.id)))
		.get();
	if (!timetable) error(404, '時間割が見つかりません');
	return {
		now: Date.now(),
		year: timetable.year,
		days: locals.user.daysShown,
		...(await loadTimetable(locals.db, timetable.id, tokyoTime(Date.now()).date))
	};
};
