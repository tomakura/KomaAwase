import { fail, redirect } from '@sveltejs/kit';
import { coursesOfCsv, parseCsv } from '$lib/csv';
import { IMPORT_COURSES_MAX, groupImported, readImport } from '$lib/import';
import { requireUser } from '$lib/server/auth/next';
import { reviewBase, saveReviewed, suggestions } from '$lib/server/import/review';
import { notifySharedChanged } from '$lib/server/shared-notify';
import { currentTimetable } from '$lib/server/timetable';
import { sharedAccess } from '$lib/server/verify';
import { currentTerm } from '$lib/terms';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

// A CSV of a few hundred courses is well under this
const CSV_MAX = 200_000;

async function context(locals: App.Locals, url: URL) {
	const me = requireUser(locals, url);
	if (!me.setupAt) redirect(303, '/');
	const timetable = await currentTimetable(locals.db, me, locals.timetable);
	return { me, timetable };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { me, timetable } = await context(locals, url);
	const today = tokyoTime(Date.now()).date;
	const [base, access] = await Promise.all([
		reviewBase(locals.db, timetable, today),
		sharedAccess(locals.db, me.id, timetable.universityId)
	]);
	const asked = url.searchParams.get('term');
	return {
		...base,
		canShare: access === 'ok',
		defaultTerm: base.terms.find((t) => t.id === asked)?.id ?? currentTerm(base.terms, today)?.id ?? null
	};
};

export const actions: Actions = {
	// The file is read in the browser (UTF-8 or Shift_JIS) and sent as text
	read: async ({ locals, url, request }) => {
		const { me, timetable } = await context(locals, url);
		const text = String((await request.formData()).get('csv') ?? '');
		if (!text.trim()) return fail(400, { message: 'ファイルが空です' });
		if (text.length > CSV_MAX) return fail(400, { message: 'ファイルが大きすぎます。授業の一覧だけにしてください' });
		const { courses, skipped } = coursesOfCsv(parseCsv(text));
		const read = readImport({ courses }, { sameSlot: true }) ?? [];
		if (!read.length) return fail(400, { message: '授業を読み取れませんでした。見出しと列をひな形に合わせてください', skipped });
		const groups = groupImported(read);
		const access = await sharedAccess(locals.db, me.id, timetable.universityId);
		const suggested = access === 'ok' ? await suggestions(locals.db, timetable, groups) : groups.map(() => []);
		return {
			groups: groups.map((g, i) => ({ ...g, suggestions: suggested[i] })),
			skipped,
			cut: courses.length > IMPORT_COURSES_MAX
		};
	},
	save: async ({ locals, url, request, platform }) => {
		const { me, timetable } = await context(locals, url);
		const saved = await saveReviewed(locals.db, me.id, timetable, await request.formData());
		if ('status' in saved) return saved;
		notifySharedChanged(platform, locals.db, me.id, saved.changedShared);
		redirect(303, saved.termId ? `/?term=${encodeURIComponent(saved.termId)}` : '/');
	}
};
