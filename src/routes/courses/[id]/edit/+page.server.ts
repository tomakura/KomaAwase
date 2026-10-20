import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { courseHref, timetableHref } from '$lib/courses';
import { deleteCourse, loadCourse, otherSlots, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import { canEditShared } from '$lib/server/shared-courses';
import { findSyllabusMatch } from '$lib/server/syllabus';
import { slotText } from '$lib/shared-changes';
import { sharedAccess } from '$lib/server/verify';
import { notifySharedChanged } from '$lib/server/shared-notify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/login');
	const loaded = await loadCourse(locals.db, locals.user.id, params.id);
	if (!loaded) error(404, '授業が見つかりません');
	const { shared, timetable } = loaded;
	const [canEdit, others, access, found] = await Promise.all([
		shared && timetable.universityId
			? canEditShared(locals.db, locals.user.id, { id: shared.id, universityId: timetable.universityId })
			: true,
		otherSlots(locals.db, timetable.id, params.id),
		sharedAccess(locals.db, locals.user.id, timetable.universityId),
		syllabusFor(locals.db, loaded)
	]);
	// Without an enrollment check a course can only be kept as it is linked, or made personal
	return {
		...loaded,
		canEditShared: canEdit,
		// The syllabus's values stay as they are while synced; only the admin changes them
		fixedBySyllabus: shared?.source === 'syllabus' && locals.user.role !== 'admin',
		// A syllabus course this one of their own seems to be, to link it (シラバスとつなぐ)
		found:
			access === 'ok' && found
				? {
						title: found.values.title,
						detail: [found.values.teachers.join('・'), found.values.slots.map(slotText).join('、')].filter(Boolean).join(' · ')
					}
				: null,
		sharedAccess: access,
		others,
		termParam: url.searchParams.get('term')
	};
};

// Only a course of their own, not linked to the shared data
function syllabusFor(db: App.Locals['db'], loaded: NonNullable<Awaited<ReturnType<typeof loadCourse>>>) {
	const { course, shared, timetable } = loaded;
	if (shared || course.syncMode !== 'personal' || !timetable.universityId) return null;
	return findSyllabusMatch(db, { universityId: timetable.universityId, year: timetable.year, title: course.title, slots: course.slots });
}

export const actions: Actions = {
	// シラバスとつなぐ: the course syncs the syllabus course from now on, keeping its own rooms,
	// terms, color and memos, and gets the syllabus memos
	link: async ({ locals, platform, params, url }) => {
		if (!locals.user) redirect(303, '/login');
		const loaded = await loadCourse(locals.db, locals.user.id, params.id);
		if (!loaded) error(404, '授業が見つかりません');
		const found = await syllabusFor(locals.db, loaded);
		if (!found) return fail(409, { message: 'つなげるシラバスの授業が見つかりませんでした' });
		const { course } = loaded;
		const saved = await saveCourse(locals.db, {
			userId: locals.user.id,
			timetable: loaded.timetable,
			terms: loaded.terms,
			courseId: params.id,
			input: {
				...found.values,
				// The rooms they had go where the syllabus course has none yet
				slots: found.values.slots.map((s) => ({
					...s,
					room: s.room ?? course.slots.find((c) => c.weekday === s.weekday && c.period === s.period)?.room ?? null
				})),
				color: course.color,
				termIds: course.termIds,
				absenceLimit: course.absenceLimit,
				syncMode: 'synced',
				sharedCourseId: found.id,
				sharedVersion: found.version
			}
		});
		if ('message' in saved) return fail(409, { message: saved.message });
		notifySharedChanged(platform, locals.db, locals.user.id, [saved.changedShared]);
		redirect(303, courseHref(params.id, url.searchParams.get('term')));
	},
	save: async ({ locals, platform, params, request, url }) => {
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
		notifySharedChanged(platform, locals.db, locals.user.id, [saved.changedShared]);
		redirect(303, courseHref(params.id, url.searchParams.get('term')));
	},
	delete: async ({ locals, params, url, platform }) => {
		if (!locals.user) redirect(303, '/login');
		if (!platform) error(500);
		try {
			const deleted = await deleteCourse(platform.env, locals.db, locals.user.id, params.id);
			if (!deleted) error(404, '授業が見つかりません');
			if (deleted === 'more') return fail(409, { message: '資料が多いので、一部だけ消しました。もう一度「この授業を消す」を押してください' });
		} catch (e) {
			if (isHttpError(e)) throw e;
			console.error('course delete failed', e);
			return fail(502, { message: '資料を消している途中で止まりました。授業と、まだ消していない資料は残っています。時間をおいてもう一度やり直してください' });
		}
		redirect(303, timetableHref(url.searchParams.get('term')));
	}
};
