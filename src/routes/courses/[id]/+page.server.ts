import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { findOwnedCourse, loadCourse } from '$lib/server/courses';
import { addNote, deleteNote, parseNote, setTaskDone } from '$lib/server/notes';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/login');
	const loaded = await loadCourse(locals.db, locals.user.id, params.id);
	if (!loaded) error(404, '授業が見つかりません');
	return { ...loaded, today: tokyoTime(Date.now()).date, termParam: url.searchParams.get('term') };
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
	}
};
