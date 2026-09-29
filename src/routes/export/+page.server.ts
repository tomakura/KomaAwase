import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/next';
import { currentTimetable, loadTimetable } from '$lib/server/timetable';
import { tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = requireUser(locals, url);
	if (!me.setupAt) redirect(303, '/');
	const now = Date.now();
	const timetable = await currentTimetable(locals.db, me, locals.timetable);
	const loaded = await loadTimetable(locals.db, timetable.id, tokyoTime(now).date);
	return {
		now,
		year: timetable.year,
		termParam: url.searchParams.get('term'),
		me: { id: me.id, nickname: me.nickname, icon: me.icon },
		days: me.daysShown,
		terms: loaded.terms,
		periods: loaded.periods,
		// Cancellations are the owner's notes and stay out of shared images.
		courses: loaded.courses.map(({ cancels: _, ...c }) => c)
	};
};
