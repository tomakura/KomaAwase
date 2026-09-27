import { error, fail, redirect } from '@sveltejs/kit';
import { courseHref, timetableHref } from '$lib/courses';
import { deleteCourse, loadCourse, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/login');
	const loaded = await loadCourse(locals.db, locals.user.id, params.id);
	if (!loaded) error(404, '授業が見つかりません');
	return { ...loaded, termParam: url.searchParams.get('term') };
};

export const actions: Actions = {
	save: async ({ locals, params, request, url }) => {
		if (!locals.user) redirect(303, '/login');
		const loaded = await loadCourse(locals.db, locals.user.id, params.id);
		if (!loaded) error(404, '授業が見つかりません');
		const parsed = parseCourseForm(await request.formData(), shapeOf(loaded));
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await saveCourse(locals.db, loaded.timetable.id, params.id, parsed.input);
		redirect(303, courseHref(params.id, url.searchParams.get('term')));
	},
	delete: async ({ locals, params, url }) => {
		if (!locals.user) redirect(303, '/login');
		if (!(await deleteCourse(locals.db, locals.user.id, params.id))) error(404, '授業が見つかりません');
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
