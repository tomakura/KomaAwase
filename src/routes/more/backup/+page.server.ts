import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/next';
import { filesIn, ownTimetables, readBackup, restoreBackup, type RestoreMode } from '$lib/server/data-restore';
import { deleteFiles, filesEnabled } from '$lib/server/files';
import type { Actions, PageServerLoad } from './$types';

// A saved file with years of notes is a few MB at most
const JSON_MAX = 5_000_000;
// Files deleted per request before a replace; the page asks again for the rest
const DELETE_ROUND = 30;

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	requireUser(locals, url);
	return { filesOn: !!platform && filesEnabled(platform.env) };
};

function backupOf(form: FormData) {
	const text = String(form.get('json') ?? '');
	if (!text || text.length > JSON_MAX) return null;
	try {
		return readBackup(JSON.parse(text));
	} catch {
		return null;
	}
}

const NOT_BACKUP = 'コマあわせで保存したファイルを選んでください';

export const actions: Actions = {
	// What the file holds, beside the timetables of the same years
	preview: async ({ locals, url, request }) => {
		const me = requireUser(locals, url);
		const backup = backupOf(await request.formData());
		if (!backup) return fail(400, { message: NOT_BACKUP });
		const own = await ownTimetables(locals.db, me.id);
		return {
			preview: {
				exportedAt: backup.exportedAt,
				events: backup.events.length,
				timetables: backup.timetables.map((t) => {
					const now = own.find((o) => o.year === t.year);
					return {
						year: t.year,
						name: t.name,
						courses: t.courses.length,
						files: t.courses.reduce((n, c) => n + c.files.length, 0),
						existing: now ? { name: now.name, courses: now.courses } : null
					};
				})
			}
		};
	},
	// Before a replace: the files of the timetables to be emptied, a round at a time
	clear: async ({ locals, url, request, platform }) => {
		const me = requireUser(locals, url);
		const years = (await request.formData()).getAll('year').map(Number);
		const own = await ownTimetables(locals.db, me.id);
		const ids = own.filter((o) => years.includes(o.year)).map((o) => o.id);
		const files = await filesIn(locals.db, ids);
		if (files.length) {
			if (!platform || !filesEnabled(platform.env)) error(503, '資料を消せませんでした。時間をおいてもう一度やり直してください');
			await deleteFiles(platform.env, locals.db, files.slice(0, DELETE_ROUND));
		}
		return { cleared: true, left: Math.max(files.length - DELETE_ROUND, 0) };
	},
	restore: async ({ locals, url, request }) => {
		const me = requireUser(locals, url);
		const form = await request.formData();
		const backup = backupOf(form);
		if (!backup) return fail(400, { message: NOT_BACKUP });
		const modes = form.getAll('mode').map((m) => (['add', 'replace', 'merge'].includes(String(m)) ? (String(m) as RestoreMode) : 'skip'));
		// A replace needs the timetable's files gone first (clear), or they would be left behind
		const own = await ownTimetables(locals.db, me.id);
		const replaced = own.filter((o) => backup.timetables.some((t, i) => modes[i] === 'replace' && t.year === o.year)).map((o) => o.id);
		if ((await filesIn(locals.db, replaced)).length) return fail(409, { message: '資料を消し終わっていません。もう一度「戻す」を押してください' });
		const result = await restoreBackup(locals.db, me, backup, modes, form.get('events') === 'on');
		return { restored: result };
	}
};
