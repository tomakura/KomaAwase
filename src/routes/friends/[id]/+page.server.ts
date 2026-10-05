import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth/next';
import { timetables } from '$lib/server/db/schema';
import { busyOnly } from '$lib/busy';
import { block, friendshipBetween, loadPeople, removeFriendship, visibleLevels } from '$lib/server/friends';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import { thisYear } from '$lib/server/setup';
import { verifiedIds } from '$lib/server/verify';
import { loadTimetable } from '$lib/server/timetable';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	if (params.id === me.id) redirect(303, '/');
	// Read side by side; nothing is shown unless the check passes.
	const now = Date.now();
	const year = thisYear();
	const [[person], visible, timetable, friendship, verified] = await Promise.all([
		loadPeople(locals.db, [params.id]),
		visibleLevels(locals.db, me.id),
		locals.db
			.select({ id: timetables.id })
			.from(timetables)
			.where(and(eq(timetables.userId, params.id), eq(timetables.year, year)))
			.get(),
		friendshipBetween(locals.db, me.id, params.id),
		verifiedIds(locals.db, [params.id])
	]);
	const level = person && visible.get(person.id);
	if (!person || !level) error(404, '時間割が見つかりません');
	const loaded = timetable ? await loadTimetable(locals.db, timetable.id, tokyoTime(now).date) : null;
	const { daysShown, universityId: _, ...profile } = person;
	// Memos, files, tasks, cancellations and moved classes stay with their owner.
	const courses = (loaded?.courses ?? []).map(({ cancels: _, maybeCancels: __, moves: ___, ...c }) => c);
	return {
		now,
		year,
		person: { ...profile, verified: verified.has(person.id) },
		isFriend: friendship?.status === 'accepted',
		days: daysShown,
		terms: loaded?.terms ?? [],
		periods: loaded?.periods ?? [],
		// Only when they are busy, if that is all they show
		busyOnly: level === 'free',
		courses: level === 'free' ? busyOnly(courses) : courses,
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
