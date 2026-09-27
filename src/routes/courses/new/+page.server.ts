import { fail, redirect } from '@sveltejs/kit';
import { timetableHref } from '$lib/courses';
import { nextColor, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user.id);
	const [shape, color] = await Promise.all([
		loadShape(locals.db, timetable.id),
		nextColor(locals.db, timetable.id)
	]);

	// Opened from an empty slot: ?term=…&day=1&period=2
	const term = shape.terms.find((t) => t.id === url.searchParams.get('term'));
	const day = Number(url.searchParams.get('day'));
	const period = Number(url.searchParams.get('period'));
	const inTimetable = day >= 1 && day <= 7 && shape.periods.some((p) => p.number === period);

	return {
		...shape,
		termParam: term?.id ?? null,
		initial: {
			title: '',
			teachers: [],
			color,
			termIds: term ? [term.id] : [],
			slots: inTimetable ? [{ weekday: day, period, span: 1, room: null }] : [],
			delivery: null,
			intensiveFrom: null,
			intensiveTo: null
		}
	};
};

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		if (!locals.user) redirect(303, '/login');
		const timetable = await currentTimetable(locals.db, locals.user.id);
		const shape = await loadShape(locals.db, timetable.id);
		const parsed = parseCourseForm(await request.formData(), shapeOf(shape));
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await saveCourse(locals.db, timetable.id, null, parsed.input);
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
