import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { universities } from '$lib/server/db/schema';
import { peopleTaking, visibleUserIds } from '$lib/server/friends';
import { searchSharedCourses } from '$lib/server/shared-courses';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import { sharedAccess } from '$lib/server/verify';
import type { PageServerLoad } from './$types';

const QUERY_MAX = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const timetable = await currentTimetable(locals.db, locals.user, locals.timetable);
	const universityId = timetable.universityId;
	// Friends (and group members who show their timetable) already taking each course
	const [shape, university, visible, access] = await Promise.all([
		loadShape(locals.db, timetable.id),
		universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, universityId)).get()
			: null,
		visibleUserIds(locals.db, locals.user.id),
		sharedAccess(locals.db, locals.user.id, universityId)
	]);

	const term = shape.terms.find((t) => t.id === url.searchParams.get('term')) ?? null;
	const day = Number(url.searchParams.get('day'));
	const period = Number(url.searchParams.get('period'));
	const slot =
		day >= 1 && day <= 7 && shape.periods.some((p) => p.number === period) ? { weekday: day, period } : null;
	const q = [...(url.searchParams.get('q') ?? '').trim()].slice(0, QUERY_MAX).join('');

	// The shared courses are for people with an enrollment check
	const results = access === 'ok' && universityId
		? await searchSharedCourses(locals.db, {
				universityId,
				year: timetable.year,
				timetableId: timetable.id,
				q,
				slot,
				termName: term?.name ?? null
			})
		: [];
	const taking = await peopleTaking(
		locals.db,
		results.map((r) => r.id),
		timetable.year,
		visible
	);

	return {
		access,
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
			users: r.users,
			friends: taking.get(r.id) ?? []
		}))
	};
};
