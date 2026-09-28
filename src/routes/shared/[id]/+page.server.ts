import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { timetables, universities } from '$lib/server/db/schema';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import { loadEdits, loadSharedCourse, restoreShared, syncedCount } from '$lib/server/shared-courses';
import type { Actions, PageServerLoad } from './$types';

// Shared data is for the university's students: anyone with a timetable there that year.
async function usable(db: App.Locals['db'], user: NonNullable<App.Locals['user']>, id: string) {
	const course = await loadSharedCourse(db, id);
	if (!course) error(404, '授業が見つかりません');
	if (user.role === 'admin') return course;
	const mine = await db
		.select({ id: timetables.id })
		.from(timetables)
		.where(
			and(eq(timetables.userId, user.id), eq(timetables.universityId, course.universityId), eq(timetables.year, course.year))
		)
		.get();
	if (!mine) error(404, '授業が見つかりません');
	return course;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const course = await usable(locals.db, me, params.id);
	const [edits, users, university] = await Promise.all([
		loadEdits(locals.db, course.id),
		syncedCount(locals.db, course.id),
		locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, course.universityId)).get()
	]);
	return {
		back: safeNext(url.searchParams.get('back')) ?? '/',
		course: {
			id: course.id,
			source: course.source,
			version: course.version,
			year: course.year,
			terms: course.terms,
			university: university?.name ?? '',
			values: course.values
		},
		users,
		edits: edits.map((e) => ({ id: e.id, createdAt: e.createdAt, diff: e.diff })),
		reportReasons: REPORT_REASONS.shared_course
	};
};

export const actions: Actions = {
	restore: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		const form = await request.formData();
		const result = await restoreShared(locals.db, {
			userId: me.id,
			course,
			editId: String(form.get('edit') ?? ''),
			version: Number(form.get('version'))
		});
		if ('message' in result) return fail(409, { message: result.message });
		return { restored: true };
	},
	report: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		const message = await saveReport(locals.db, me.id, 'shared_course', course.id, await request.formData());
		if (message) return fail(400, { message });
		return { reported: true };
	}
};
