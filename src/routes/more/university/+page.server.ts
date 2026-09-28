import { fail, redirect } from '@sveltejs/kit';
import { presetsFor, saveTimetableShape, thisYear, timetableSettings } from '$lib/server/setup';
import { currentTimetable } from '$lib/server/timetable';
import { findOrCreateUniversity, listUniversities } from '$lib/server/universities';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	await currentTimetable(locals.db, locals.user);
	const year = thisYear();
	const [list, settings] = await Promise.all([listUniversities(locals.db), timetableSettings(locals.db, locals.user, year)]);
	return {
		universityName: settings.universityName,
		universities: list.map((u) => u.name),
		presetNames: presetsFor(list, year).map((p) => p.name)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const name = String(form.get('university') ?? '').trim();
		const university = name ? await findOrCreateUniversity(locals.db, name) : null;
		if (name && !university) return fail(400, { message: '大学名を40文字までで入れてください' });

		const year = thisYear();
		const settings = await timetableSettings(locals.db, locals.user, year);
		const preset =
			form.get('usePreset') === 'on' && university
				? presetsFor(await listUniversities(locals.db), year).find((p) => p.name === university.name)
				: undefined;
		await saveTimetableShape(locals.db, locals.user, year, {
			universityId: university?.id ?? null,
			terms: preset?.terms ?? settings.terms,
			periods: preset?.periods ?? settings.periods
		});
		redirect(303, '/more');
	}
};
