import { redirect } from '@sveltejs/kit';
import { getOrCreateTimetable } from '$lib/server/timetable';
import { academicYear, tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	if (!locals.user.nickname) redirect(303, '/welcome');
	const year = academicYear(tokyoTime(Date.now()).date);
	await getOrCreateTimetable(locals.db, locals.user.id, year);
	return { nickname: locals.user.nickname };
};
