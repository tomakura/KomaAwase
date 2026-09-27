import { fail, redirect } from '@sveltejs/kit';
import { timetableHref } from '$lib/courses';
import { nextColor, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import { loadSharedCourse } from '$lib/server/shared-courses';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user.id);
	const sharedId = url.searchParams.get('shared');
	const [shape, color, found] = await Promise.all([
		loadShape(locals.db, timetable.id),
		nextColor(locals.db, timetable.id),
		sharedId ? loadSharedCourse(locals.db, sharedId) : null
	]);
	const shared =
		found && found.universityId === timetable.universityId && found.year === timetable.year ? found : null;

	// Opened from an empty slot (?term=…&day=1&period=2), maybe via 授業をさがす (&shared=…)
	const term = shape.terms.find((t) => t.id === url.searchParams.get('term'));
	const day = Number(url.searchParams.get('day'));
	const period = Number(url.searchParams.get('period'));
	const inTimetable = day >= 1 && day <= 7 && shape.periods.some((p) => p.number === period);
	const sharedTerms = shared ? shape.terms.filter((t) => shared.terms.includes(t.name)).map((t) => t.id) : [];

	const values = shared
		? shared.values
		: {
				title: '',
				teachers: [],
				slots: inTimetable ? [{ weekday: day, period, span: 1, room: null }] : [],
				delivery: null,
				intensiveFrom: null,
				intensiveTo: null
			};
	const search = new URLSearchParams(url.search);
	search.delete('shared');

	return {
		...shape,
		termParam: term?.id ?? null,
		backHref: inTimetable ? `/courses/search?${search}` : timetableHref(term?.id ?? null),
		sync: {
			canSync: !!timetable.universityId,
			year: timetable.year,
			shared: shared && { id: shared.id, source: shared.source, values: shared.values }
		},
		initial: {
			...values,
			color,
			termIds: sharedTerms.length ? sharedTerms : term ? [term.id] : [],
			syncMode: timetable.universityId ? ('synced' as const) : ('personal' as const)
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
		await saveCourse(locals.db, {
			userId: locals.user.id,
			timetable,
			terms: shape.terms,
			courseId: null,
			input: parsed.input
		});
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
