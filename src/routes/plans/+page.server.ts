import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { findOwnedCourse } from '$lib/server/courses';
import { addNote, parseNote, setTaskDone } from '$lib/server/notes';
import { deleteEventKept, deleteNoteKept } from '$lib/server/undo';
import { upcomingExamPeriods } from '$lib/server/calendar';
import { addEvent, listCourseChoices, loadPlans, parseEvent, updateEvent } from '$lib/server/plans';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:plans');
	// Passed down so the first render in the browser matches the server's
	const now = Date.now();
	const today = tokyoTime(now).date;
	const [plans, courses, examPeriods] = await Promise.all([
		loadPlans(locals.db, locals.user.id, today),
		listCourseChoices(locals.db, locals.user.id, today),
		upcomingExamPeriods(locals.db, locals.user.id, today)
	]);
	return { now, plans, courses, examPeriods };
};

async function ownCourse({ locals }: RequestEvent, form: FormData) {
	if (!locals.user) redirect(303, '/login');
	const courseId = String(form.get('courseId') ?? '');
	if (!courseId || !(await findOwnedCourse(locals.db, locals.user.id, courseId))) error(404, '授業が見つかりません');
	return courseId;
}

export const actions: Actions = {
	addTask: async (event) => {
		const form = await event.request.formData();
		if (!event.locals.user) redirect(303, '/login');
		if (!form.get('courseId')) return fail(400, { message: '授業を選んでください' });
		const courseId = await ownCourse(event, form);
		form.set('kind', 'task');
		const parsed = parseNote(form);
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await addNote(event.locals.db, courseId, parsed.note);
		return { added: true };
	},
	done: async (event) => {
		const form = await event.request.formData();
		const courseId = await ownCourse(event, form);
		await setTaskDone(event.locals.db, courseId, String(form.get('id')), form.get('done') === 'on');
	},
	removeTask: async (event) => {
		const form = await event.request.formData();
		const courseId = await ownCourse(event, form);
		return { undo: await deleteNoteKept(event.locals.db, event.locals.user!.id, courseId, String(form.get('id'))) };
	},
	addEvent: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const parsed = parseEvent(await request.formData());
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await addEvent(locals.db, locals.user.id, parsed.event);
		return { added: true };
	},
	updateEvent: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const parsed = parseEvent(form);
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await updateEvent(locals.db, locals.user.id, String(form.get('id') ?? ''), parsed.event);
		return { added: true };
	},
	removeEvent: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		return { undo: await deleteEventKept(locals.db, locals.user.id, String((await request.formData()).get('id') ?? '')) };
	}
};
