import { fail, redirect } from '@sveltejs/kit';
import { parsePeriods, periodsProblem } from '$lib/presets';
import { savePeriods, thisYear, timetableSettings } from '$lib/server/setup';
import { currentTimetable } from '$lib/server/timetable';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user, locals.timetable);
	const settings = await timetableSettings(locals.db, locals.user, thisYear(), timetable);
	return { periods: settings.periods, usedPeriods: settings.usedPeriods };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const periods = parsePeriods(String((await request.formData()).get('periods') ?? ''));
		if (!periods) return fail(400, { message: '入力を読み取れませんでした。もう一度お試しください' });
		const problem = periodsProblem(periods);
		if (problem) return fail(400, { message: problem });
		const timetable = await currentTimetable(locals.db, locals.user);
		await savePeriods(locals.db, timetable.id, periods);
		redirect(303, '/more');
	}
};
