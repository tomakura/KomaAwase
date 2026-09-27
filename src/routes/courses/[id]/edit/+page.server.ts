import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
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
		const saved = await saveCourse(locals.db, {
			userId: locals.user.id,
			timetable: loaded.timetable,
			terms: loaded.terms,
			courseId: params.id,
			input: parsed.input
		});
		if ('message' in saved) return fail(409, { message: saved.message });
		redirect(303, courseHref(params.id, url.searchParams.get('term')));
	},
	delete: async ({ locals, params, url, platform }) => {
		if (!locals.user) redirect(303, '/login');
		if (!platform) error(500);
		try {
			if (!(await deleteCourse(platform.env, locals.db, locals.user.id, params.id))) {
				error(404, '授業が見つかりません');
			}
		} catch (e) {
			if (isHttpError(e)) throw e;
			console.error('course delete failed', e);
			return fail(502, { message: '資料を消せなかったので、授業も消していません。時間をおいてもう一度お試しください' });
		}
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
