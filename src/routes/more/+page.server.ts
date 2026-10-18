import { fail, redirect } from '@sveltejs/kit';
import { and, count, eq, lt } from 'drizzle-orm';
import { TERM_SYSTEMS, parseDays, periodsRange, termSystemOf } from '$lib/presets';
import { contactMessages, feedback, reports, timetables, universities, users } from '$lib/server/db/schema';
import { readTheme, thisYear } from '$lib/server/setup';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import { currentTerm } from '$lib/terms';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const user = locals.user;
	const year = thisYear();
	const timetable = await currentTimetable(locals.db, user, locals.timetable);
	const [shape, [past], university] = await Promise.all([
		loadShape(locals.db, timetable.id),
		locals.db
			.select({ n: count() })
			.from(timetables)
			.where(and(eq(timetables.userId, user.id), lt(timetables.year, year))),
		user.universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, user.universityId)).get()
			: undefined
	]);

	// What the runner of the app has left to answer
	let openReports = 0;
	if (user.role === 'admin') {
		const [[r], [f], [c]] = await locals.db.batch([
			locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
			locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open')),
			locals.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'open'))
		]);
		openReports = (r?.n ?? 0) + (f?.n ?? 0) + (c?.n ?? 0);
	}

	// The term on now (or next), for 「2026年度 後期」
	const today = tokyoTime(Date.now()).date;
	const term = currentTerm(shape.terms, today);
	const system = termSystemOf(shape.terms);

	return {
		user: { id: user.id, nickname: user.nickname, icon: user.icon, theme: user.theme, days: user.daysShown },
		shareCancellations: user.shareCancellations,
		timetableLabel: `${timetable.year}年度${term ? ` ${term.groupName ?? term.name}` : ''}`,
		termsLabel: TERM_SYSTEMS.find((s) => s.id === system)?.label ?? `${shape.terms.length}学期`,
		periodsLabel: periodsRange(shape.periods),
		pastCount: past?.n ?? 0,
		universityName: university?.name ?? null,
		supportUrl: platform?.env.SUPPORT_URL || null,
		isAdmin: user.role === 'admin',
		openReports
	};
};

export const actions: Actions = {
	theme: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const theme = readTheme(await request.formData());
		if (!theme) return fail(400, { message: 'テーマを選んでください' });
		await locals.db.update(users).set({ theme }).where(eq(users.id, locals.user.id));
	},
	shareCancellations: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const on = (await request.formData()).get('share') === 'on';
		await locals.db.update(users).set({ shareCancellations: on }).where(eq(users.id, locals.user.id));
	},
	days: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const days = parseDays(String((await request.formData()).get('days') ?? ''));
		if (!days) return fail(400, { message: '曜日を1つ以上選んでください' });
		await locals.db.update(users).set({ daysShown: days }).where(eq(users.id, locals.user.id));
	}
};
