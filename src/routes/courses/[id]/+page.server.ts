import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { findOwnedCourse, loadCourse } from '$lib/server/courses';
import { USER_QUOTA_BYTES, deleteFile, filesEnabled, listFiles, usedBytes } from '$lib/server/files';
import { addNote, deleteNote, parseNote, setTaskDone } from '$lib/server/notes';
import { tokyoTime } from '$lib/time';
import { sharedAccess } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const [loaded, files, used] = await Promise.all([
		loadCourse(locals.db, locals.user.id, params.id),
		listFiles(locals.db, params.id),
		usedBytes(locals.db, locals.user.id)
	]);
	if (!loaded) error(404, '授業が見つかりません');
	// The みんなの授業データ page is for people with an enrollment check
	const shareable = loaded.shared ? (await sharedAccess(locals.db, locals.user.id, loaded.timetable.universityId)) === 'ok' : false;
	return {
		...loaded,
		shareable,
		files,
		usedBytes: used,
		quotaBytes: USER_QUOTA_BYTES,
		filesEnabled: !!platform && filesEnabled(platform.env),
		today: tokyoTime(Date.now()).date,
		termParam: url.searchParams.get('term')
	};
};

async function ownCourse({ locals, params }: RequestEvent<{ id: string }>) {
	if (!locals.user) redirect(303, '/login');
	if (!(await findOwnedCourse(locals.db, locals.user.id, params.id))) error(404, '授業が見つかりません');
	return params.id;
}

export const actions: Actions = {
	note: async (event) => {
		const courseId = await ownCourse(event);
		const parsed = parseNote(await event.request.formData());
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await addNote(event.locals.db, courseId, parsed.note);
		return { added: true };
	},
	done: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		await setTaskDone(event.locals.db, courseId, String(form.get('id')), form.get('done') === 'on');
	},
	remove: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		await deleteNote(event.locals.db, courseId, String(form.get('id')));
	},
	removeFile: async (event) => {
		const courseId = await ownCourse(event);
		if (!event.platform) error(500);
		const form = await event.request.formData();
		try {
			await deleteFile(event.platform.env, event.locals.db, courseId, String(form.get('id')));
		} catch (e) {
			console.error('file delete failed', e);
			return fail(502, { message: '資料を消せませんでした。時間をおいてもう一度やり直してください' });
		}
	}
};
