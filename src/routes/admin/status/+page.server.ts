import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/reauth';
import { statusNotes } from '$lib/server/db/schema';
import { dailyQuality, loadNotes, resolveNote, signals } from '$lib/server/status';
import { syncNotices } from '$lib/server/status-page';
import type { Actions, PageServerLoad } from './$types';

const BODY_MAX = 300;
const SYNC_FAILED = '稼働状況ページに反映できませんでした。「もう一度反映する」を押してください';

// The notices on the status page and the strip in the app, and how well things went day by day (counts only)
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const [notes, days, now] = await Promise.all([loadNotes(locals.db), dailyQuality(locals.db), signals(locals.db)]);
	return { notes, days, signals: now };
};

export const actions: Actions = {
	add: async ({ locals, request, url, platform }) => {
		await requireAdmin(locals, url);
		const form = await request.formData();
		const level = form.get('level') === 'trouble' ? 'trouble' : 'info';
		const body = String(form.get('body') ?? '').trim();
		if (!body || [...body].length > BODY_MAX) return fail(400, { message: `お知らせは1〜${BODY_MAX}文字で書いてください` });
		await locals.db.insert(statusNotes).values({ level, body });
		if ((await syncNotices(platform?.env, locals.db)) === 'failed') return fail(502, { syncFailed: SYNC_FAILED });
		return { added: true };
	},
	resolve: async ({ locals, request, url, platform }) => {
		await requireAdmin(locals, url);
		await resolveNote(locals.db, String((await request.formData()).get('id') ?? ''));
		if ((await syncNotices(platform?.env, locals.db)) === 'failed') return fail(502, { syncFailed: SYNC_FAILED });
	},
	sync: async ({ locals, url, platform }) => {
		await requireAdmin(locals, url);
		if ((await syncNotices(platform?.env, locals.db)) === 'failed') return fail(502, { syncFailed: SYNC_FAILED });
		return { synced: true };
	}
};
