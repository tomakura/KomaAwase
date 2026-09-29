import { fail, redirect } from '@sveltejs/kit';
import { parseTerms, termsProblem } from '$lib/terms';
import { presetsFor, saveTerms, thisYear, timetableSettings } from '$lib/server/setup';
import { currentTimetable } from '$lib/server/timetable';
import { listUniversities } from '$lib/server/universities';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user, locals.timetable);
	const year = thisYear();
	const [settings, list] = await Promise.all([
		timetableSettings(locals.db, locals.user, year, timetable),
		listUniversities(locals.db)
	]);
	const preset = presetsFor(list, year).find((p) => p.name === settings.universityName);
	return { year, terms: settings.terms, preset: preset?.terms ?? null };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const terms = parseTerms(String((await request.formData()).get('terms') ?? ''));
		if (!terms) return fail(400, { message: '入力を読み取れませんでした。もう一度お試しください' });
		const problem = termsProblem(terms);
		if (problem) return fail(400, { message: problem });
		const timetable = await currentTimetable(locals.db, locals.user);
		await saveTerms(locals.db, timetable.id, terms);
		redirect(303, '/more');
	}
};
