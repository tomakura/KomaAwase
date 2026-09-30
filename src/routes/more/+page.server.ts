import { fail, redirect } from '@sveltejs/kit';
import { and, count, eq, gt, lt } from 'drizzle-orm';
import { TERM_SYSTEMS, parseDays, periodsRange, termSystemOf } from '$lib/presets';
import { feedback, passkeys, reports, sessions, timetables, universities, users } from '$lib/server/db/schema';
import { readTheme, thisYear } from '$lib/server/setup';
import { currentTimetable, loadShape } from '$lib/server/timetable';
import { currentTerm } from '$lib/terms';
import { tokyoTime } from '$lib/time';
import { daysLeft } from '$lib/verify-prompt';
import { verificationOf } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const user = locals.user;
	const year = thisYear();
	const timetable = await currentTimetable(locals.db, user, locals.timetable);
	const [shape, [past], [keys], [devices], university, verification] = await Promise.all([
		loadShape(locals.db, timetable.id),
		locals.db
			.select({ n: count() })
			.from(timetables)
			.where(and(eq(timetables.userId, user.id), lt(timetables.year, year))),
		locals.db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, user.id)),
		locals.db
			.select({ n: count() })
			.from(sessions)
			.where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))),
		user.universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, user.universityId)).get()
			: undefined,
		verificationOf(locals.db, user.id)
	]);

	// What the runner of the app has left to answer
	let openReports = 0;
	if (user.role === 'admin') {
		const [[r], [f]] = await locals.db.batch([
			locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
			locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open'))
		]);
		openReports = (r?.n ?? 0) + (f?.n ?? 0);
	}

	// The term on now (or next), for 「2026年度 後期」
	const today = tokyoTime(Date.now()).date;
	const term = currentTerm(shape.terms, today);
	const system = termSystemOf(shape.terms);

	const valid = !!verification && verification.universityId === user.universityId && verification.expiresAt.getTime() > Date.now();

	return {
		user: { id: user.id, nickname: user.nickname, icon: user.icon, theme: user.theme, days: user.daysShown },
		timetableLabel: `${timetable.year}年度${term ? ` ${term.groupName ?? term.name}` : ''}`,
		termsLabel: TERM_SYSTEMS.find((s) => s.id === system)?.label ?? `${shape.terms.length}学期`,
		periodsLabel: periodsRange(shape.periods),
		pastCount: past?.n ?? 0,
		passkeyCount: keys?.n ?? 0,
		sessionCount: devices?.n ?? 1,
		universityName: university?.name ?? null,
		supportUrl: platform?.env.SUPPORT_URL || null,
		isAdmin: user.role === 'admin',
		openReports,
		verified: valid,
		// Days until the check lapses, when there is one to lapse
		verifyDays: valid && verification ? daysLeft(verification.expiresAt.getTime(), Date.now()) : null
	};
};

export const actions: Actions = {
	theme: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const theme = readTheme(await request.formData());
		if (!theme) return fail(400, { message: 'テーマを選んでください' });
		await locals.db.update(users).set({ theme }).where(eq(users.id, locals.user.id));
	},
	days: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const days = parseDays(String((await request.formData()).get('days') ?? ''));
		if (!days) return fail(400, { message: '曜日を1つ以上選んでください' });
		await locals.db.update(users).set({ daysShown: days }).where(eq(users.id, locals.user.id));
	}
};
