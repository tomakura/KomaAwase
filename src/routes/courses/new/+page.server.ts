import { fail, redirect } from '@sveltejs/kit';
import { timetableHref } from '$lib/courses';
import { nextColor, otherSlots, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import { loadSharedCourse } from '$lib/server/shared-courses';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import { sharedAccess } from '$lib/server/verify';
import { notifySharedChanged } from '$lib/server/shared-notify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user, locals.timetable);
	const sharedId = url.searchParams.get('shared');
	const [shape, color, found, others, access] = await Promise.all([
		loadShape(locals.db, timetable.id),
		nextColor(locals.db, timetable.id),
		sharedId ? loadSharedCourse(locals.db, sharedId) : null,
		otherSlots(locals.db, timetable.id, null),
		sharedAccess(locals.db, locals.user.id, timetable.universityId)
	]);
	// The shared data is for people with an enrollment check
	const shared =
		access === 'ok' && found && found.universityId === timetable.universityId && found.year === timetable.year ? found : null;

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
				intensiveTo: null,
				credits: null
			};
	const search = new URLSearchParams(url.search);
	search.delete('shared');

	return {
		...shape,
		termParam: term?.id ?? null,
		universityId: timetable.universityId,
		others,
		backHref: inTimetable ? `/courses/search?${search}` : timetableHref(term?.id ?? null),
		sync: {
			canSync: access === 'ok',
			locked: access === 'need-verify' || access === 'unsupported' ? access : null,
			year: timetable.year,
			shared: shared && { id: shared.id, source: shared.source, version: shared.version, values: shared.values },
			// Only someone who already has it (and is verified) changes it for everyone
			canEdit: !shared
		},
		initial: {
			...values,
			color,
			termIds: sharedTerms.length ? sharedTerms : term ? [term.id] : [],
			syncMode: access === 'ok' ? ('synced' as const) : ('personal' as const)
		}
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, request, url }) => {
		if (!locals.user) redirect(303, '/login');
		const timetable = await currentTimetable(locals.db, locals.user);
		const shape = await loadShape(locals.db, timetable.id);
		const parsed = parseCourseForm(await request.formData(), shapeOf(shape));
		if ('message' in parsed) return fail(400, { message: parsed.message });
		const saved = await saveCourse(locals.db, {
			userId: locals.user.id,
			timetable,
			terms: shape.terms,
			courseId: null,
			input: parsed.input
		});
		if ('message' in saved) return fail(409, { message: saved.message });
		notifySharedChanged(platform, locals.db, locals.user.id, [saved.changedShared]);
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
