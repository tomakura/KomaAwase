import { fail, redirect } from '@sveltejs/kit';
import { takeNext } from '$lib/server/auth/next';
import { presetsFor, readDays, readShape, readTheme, saveTimetableShape, thisYear, timetableSettings } from '$lib/server/setup';
import { findOrCreateUniversity, listUniversities } from '$lib/server/universities';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.nickname) redirect(303, '/welcome');
	const year = thisYear();
	const [list, settings] = await Promise.all([listUniversities(locals.db), timetableSettings(locals.db, locals.user, year)]);
	return {
		year,
		universities: list.map((u) => u.name),
		presets: presetsFor(list, year),
		...settings,
		days: locals.user.daysShown,
		theme: locals.user.theme
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const shape = readShape(form);
		if ('message' in shape) return fail(400, { message: shape.message });
		const days = readDays(form);
		const theme = readTheme(form);
		if (!days || !theme) return fail(400, { message: '入力を読み取れませんでした。もう一度お試しください' });

		const name = String(form.get('university') ?? '').trim();
		const university = name ? await findOrCreateUniversity(locals.db, name) : null;
		if (name && !university) return fail(400, { message: '大学名を40文字までで入れてください' });

		await saveTimetableShape(
			locals.db,
			locals.user,
			thisYear(),
			{ ...shape, universityId: university?.id ?? null },
			{ daysShown: days, theme, setupAt: new Date() }
		);
		redirect(303, takeNext(cookies) ?? '/');
	}
};
