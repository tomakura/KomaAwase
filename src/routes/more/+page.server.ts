import { fail, redirect } from '@sveltejs/kit';
import { and, count, eq, lt } from 'drizzle-orm';
import { TERM_SYSTEMS, parseDays, periodsRange, termSystemOf } from '$lib/presets';
import { passkeys, timetables, universities, users } from '$lib/server/db/schema';
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
	const [shape, [past], [keys], university, verification] = await Promise.all([
		loadShape(locals.db, timetable.id),
		locals.db
			.select({ n: count() })
			.from(timetables)
			.where(and(eq(timetables.userId, user.id), lt(timetables.year, year))),
		locals.db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, user.id)),
		user.universityId
			? locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, user.universityId)).get()
			: undefined,
		verificationOf(locals.db, user.id)
	]);

	// The term on now (or next), for 「2026年度 後期」
	const today = tokyoTime(Date.now()).date;
	const term = currentTerm(shape.terms, today);
	const system = termSystemOf(shape.terms);

	return {
		user: { id: user.id, nickname: user.nickname, icon: user.icon, theme: user.theme, days: user.daysShown },
		timetableLabel: `${timetable.year}年度${term ? ` ${term.groupName ?? term.name}` : ''}`,
		termsLabel: TERM_SYSTEMS.find((s) => s.id === system)?.label ?? `${shape.terms.length}学期`,
		periodsLabel: periodsRange(shape.periods),
		pastCount: past?.n ?? 0,
		passkeyCount: keys?.n ?? 0,
		universityName: university?.name ?? null,
		supportUrl: platform?.env.SUPPORT_URL || null,
		isAdmin: user.role === 'admin',
		verified:
			!!verification && verification.universityId === user.universityId && verification.expiresAt.getTime() > Date.now(),
		// Days until the check lapses, when there is one to lapse
		verifyDays:
			verification && verification.universityId === user.universityId && verification.expiresAt.getTime() > Date.now()
				? daysLeft(verification.expiresAt.getTime(), Date.now())
				: null
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
