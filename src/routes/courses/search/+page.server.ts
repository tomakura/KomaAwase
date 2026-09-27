import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { universities } from '$lib/server/db/schema';
import { searchSharedCourses } from '$lib/server/shared-courses';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import type { PageServerLoad } from './$types';

const QUERY_MAX = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user.id);
	const shape = await loadShape(locals.db, timetable.id);

	const term = shape.terms.find((t) => t.id === url.searchParams.get('term')) ?? null;
	const day = Number(url.searchParams.get('day'));
	const period = Number(url.searchParams.get('period'));
	const slot =
		day >= 1 && day <= 7 && shape.periods.some((p) => p.number === period) ? { weekday: day, period } : null;
	const q = [...(url.searchParams.get('q') ?? '').trim()].slice(0, QUERY_MAX).join('');

	const universityId = timetable.universityId;
	const [university, results] = universityId
		? await Promise.all([
				locals.db
					.select({ name: universities.name })
					.from(universities)
					.where(eq(universities.id, universityId))
					.get(),
				searchSharedCourses(locals.db, {
					universityId,
					year: timetable.year,
					timetableId: timetable.id,
					q,
					slot,
					termName: term?.name ?? null
				})
			])
		: [null, []];

	return {
		termParam: term?.id ?? null,
		termName: term?.name ?? null,
		slot,
		q,
		year: timetable.year,
		universityName: university?.name ?? null,
		periods: shape.periods,
		results: results.map((r) => ({
			id: r.id,
			title: r.values.title,
			teachers: r.values.teachers,
			slots: r.values.slots,
			source: r.source,
			users: r.users
		}))
	};
};
