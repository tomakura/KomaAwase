import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { TERM_SYSTEMS, periodsRange, termSystemOf } from '$lib/presets';
import { universities } from '$lib/server/db/schema';
import { currentTimetable, loadTimetable } from '$lib/server/timetable';
import { tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user);
	const [loaded, university] = await Promise.all([
		loadTimetable(locals.db, timetable.id, tokyoTime(Date.now()).date),
		timetable.universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, timetable.universityId)).get()
			: undefined
	]);
	const system = termSystemOf(loaded.terms);
	return {
		year: timetable.year,
		universityName: university?.name ?? null,
		termsLabel: TERM_SYSTEMS.find((s) => s.id === system)?.label ?? `${loaded.terms.length}学期`,
		periodsLabel: periodsRange(loaded.periods),
		terms: loaded.terms,
		periods: loaded.periods,
		courses: loaded.courses
	};
};
