import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { courseAbsences, courseNotes } from '$lib/server/db/schema';
import { findOwnedCourse, loadCourse } from '$lib/server/courses';
import { USER_QUOTA_BYTES, deleteFile, filesEnabled, listFiles, usedBytes } from '$lib/server/files';
import { reportCancellation, reportedDates, sharedCancellations } from '$lib/server/cancellations';
import { addEvent, listCourseEvents, parseEvent } from '$lib/server/plans';
import { deleteEventKept, deleteNoteKept } from '$lib/server/undo';
import { addNote, orderMemoIds, parseNote, setTaskDone, updateNote } from '$lib/server/notes';
import { isDate, tokyoTime } from '$lib/time';
import { sharedAccess } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const [loaded, files, used, courseEvents] = await Promise.all([
		loadCourse(locals.db, locals.user.id, params.id),
		listFiles(locals.db, params.id),
		usedBytes(locals.db, locals.user.id),
		listCourseEvents(locals.db, params.id)
	]);
	if (!loaded) error(404, '授業が見つかりません');
	// The みんなの授業データ page is for people with an enrollment check
	const shareable = loaded.shared ? (await sharedAccess(locals.db, locals.user.id, loaded.timetable.universityId)) === 'ok' : false;
	const today = tokyoTime(Date.now()).date;
	// What others syncing this class have marked as cancelled, apart from days already marked here
	const synced = loaded.course.syncMode === 'synced' ? loaded.shared : null;
	const [votes, reported] = synced
		? await Promise.all([
				sharedCancellations(locals.db, locals.user.id, [synced.id], today),
				reportedDates(locals.db, locals.user.id, synced.id)
			])
		: [[], []];
	const own = new Set(loaded.notes.filter((n) => n.kind === 'cancel').map((n) => n.date));
	return {
		...loaded,
		sharedCancels: votes
			.filter((v) => !own.has(v.date))
			.map((v) => ({ date: v.date, n: v.n, reported: reported.includes(v.date) }))
			.sort((a, b) => a.date.localeCompare(b.date)),
		shareable,
		files,
		events: courseEvents,
		usedBytes: used,
		quotaBytes: USER_QUOTA_BYTES,
		filesEnabled: !!platform && filesEnabled(platform.env),
		today,
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
	// Marks the day as cancelled here too, as others syncing the class have
	adoptCancel: async (event) => {
		const courseId = await ownCourse(event);
		const date = String((await event.request.formData()).get('date') ?? '');
		if (!isDate(date)) return fail(400, { message: '日付を確かめてください' });
		const has = await event.locals.db
			.select({ id: courseNotes.id })
			.from(courseNotes)
			.where(and(eq(courseNotes.courseId, courseId), eq(courseNotes.kind, 'cancel'), eq(courseNotes.date, date)))
			.get();
		if (!has) await addNote(event.locals.db, courseId, { kind: 'cancel', date, body: '' });
	},
	reportCancel: async (event) => {
		const courseId = await ownCourse(event);
		const date = String((await event.request.formData()).get('date') ?? '');
		if (!isDate(date)) return fail(400, { message: '日付を確かめてください' });
		const loaded = await loadCourse(event.locals.db, event.locals.user!.id, courseId);
		if (loaded?.course.syncMode !== 'synced' || !loaded.shared) error(404, '授業が見つかりません');
		await reportCancellation(event.locals.db, event.locals.user!.id, loaded.shared.id, date);
	},
	// An event of this class (an exam, say); it also shows in the 予定 tab
	event: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		form.set('courseId', courseId);
		const parsed = parseEvent(form);
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await addEvent(event.locals.db, event.locals.user!.id, parsed.event);
		return { added: true };
	},
	removeEvent: async (event) => {
		await ownCourse(event);
		const form = await event.request.formData();
		return { undo: await deleteEventKept(event.locals.db, event.locals.user!.id, String(form.get('id') ?? '')) };
	},
	// Today (Japan time); a day already recorded stays one
	absent: async (event) => {
		const courseId = await ownCourse(event);
		await event.locals.db
			.insert(courseAbsences)
			.values({ courseId, date: tokyoTime(Date.now()).date })
			.onConflictDoNothing();
	},
	removeAbsence: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		await event.locals.db
			.delete(courseAbsences)
			.where(and(eq(courseAbsences.id, String(form.get('id'))), eq(courseAbsences.courseId, courseId)));
	},
	edit: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		const parsed = parseNote(form);
		if ('message' in parsed) return fail(400, { message: parsed.message, editing: String(form.get('id')) });
		await updateNote(event.locals.db, courseId, String(form.get('id')), parsed.note);
		return { edited: true };
	},
	order: async (event) => {
		const courseId = await ownCourse(event);
		const ids = (await event.request.formData()).getAll('id').map(String).slice(0, 500);
		await orderMemoIds(event.locals.db, courseId, ids);
		return { ordered: true };
	},
	done: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		await setTaskDone(event.locals.db, courseId, String(form.get('id')), form.get('done') === 'on');
	},
	remove: async (event) => {
		const courseId = await ownCourse(event);
		const form = await event.request.formData();
		return { undo: await deleteNoteKept(event.locals.db, event.locals.user!.id, courseId, String(form.get('id'))) };
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
