import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth/next';
import { timetables } from '$lib/server/db/schema';
import { block, canSeeTimetable, friendshipBetween, loadPeople, removeFriendship } from '$lib/server/friends';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import { thisYear } from '$lib/server/setup';
import { verifiedIds } from '$lib/server/verify';
import { loadTimetable } from '$lib/server/timetable';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	if (params.id === me.id) redirect(303, '/');
	const [person] = await loadPeople(locals.db, [params.id]);
	if (!person || !(await canSeeTimetable(locals.db, me.id, person.id))) error(404, '時間割が見つかりません');

	const now = Date.now();
	const year = thisYear();
	const [timetable, friendship, verified] = await Promise.all([
		locals.db
			.select({ id: timetables.id })
			.from(timetables)
			.where(and(eq(timetables.userId, person.id), eq(timetables.year, year)))
			.get(),
		friendshipBetween(locals.db, me.id, person.id),
		verifiedIds(locals.db, [person.id])
	]);
	const loaded = timetable ? await loadTimetable(locals.db, timetable.id, tokyoTime(now).date) : null;
	const { daysShown, universityId: _, ...profile } = person;
	return {
		now,
		year,
		person: { ...profile, verified: verified.has(person.id) },
		isFriend: friendship?.status === 'accepted',
		days: daysShown,
		terms: loaded?.terms ?? [],
		periods: loaded?.periods ?? [],
		// Memos, files, tasks and cancellations stay with their owner.
		courses: (loaded?.courses ?? []).map(({ cancels: _, ...c }) => c),
		reportReasons: REPORT_REASONS.user
	};
};

export const actions: Actions = {
	unfriend: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		await removeFriendship(locals.db, me.id, params.id);
		redirect(303, '/friends');
	},
	block: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		await block(locals.db, me.id, params.id);
		redirect(303, '/friends');
	},
	report: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const message = await saveReport(locals.db, me.id, 'user', params.id, await request.formData());
		if (message) return fail(400, { message });
		return { reported: true };
	}
};
