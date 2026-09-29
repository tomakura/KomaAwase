import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { timetables, universities } from '$lib/server/db/schema';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import { canEditShared, loadEdits, loadSharedCourse, restoreShared, syncedCount, writeShared } from '$lib/server/shared-courses';
import { sharedAccess } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

// Shared data is for the university's students with an enrollment check: anyone with a
// timetable there that year who has one.
async function usable(db: App.Locals['db'], user: NonNullable<App.Locals['user']>, id: string) {
	const course = await loadSharedCourse(db, id);
	if (!course) error(404, '授業が見つかりません');
	if (user.role === 'admin') return course;
	if ((await sharedAccess(db, user.id, course.universityId)) !== 'ok') error(404, '授業が見つかりません');
	const mine = await db
		.select({ id: timetables.id })
		.from(timetables)
		.where(
			and(eq(timetables.userId, user.id), eq(timetables.universityId, course.universityId), eq(timetables.year, course.year))
		)
		.get();
	if (!mine) error(404, '授業が見つかりません');
	return course;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const course = await usable(locals.db, me, params.id);
	// Older changes come a page at a time
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), 1000);
	const [history, users, university, canEdit] = await Promise.all([
		loadEdits(locals.db, course.id, page),
		syncedCount(locals.db, course.id),
		locals.db.select({ name: universities.name }).from(universities).where(eq(universities.id, course.universityId)).get(),
		canEditShared(locals.db, me.id, course)
	]);
	return {
		back: safeNext(url.searchParams.get('back')) ?? '/',
		course: {
			id: course.id,
			source: course.source,
			version: course.version,
			year: course.year,
			terms: course.terms,
			university: university?.name ?? '',
			values: course.values
		},
		users,
		canEdit,
		isAdmin: me.role === 'admin',
		edits: history.edits.map((e) => ({ id: e.id, createdAt: e.createdAt, diff: e.diff })),
		page,
		more: history.more,
		reportReasons: REPORT_REASONS.shared_course
	};
};

export const actions: Actions = {
	restore: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		if (!(await canEditShared(locals.db, me.id, course))) {
			return fail(403, { message: '元に戻せるのは、この授業を同期していて在籍確認済みの人です' });
		}
		const form = await request.formData();
		const result = await restoreShared(locals.db, {
			userId: me.id,
			course,
			editId: String(form.get('edit') ?? ''),
			version: Number(form.get('version'))
		});
		if ('message' in result) return fail(409, { message: result.message });
		return { restored: true };
	},
	// Whoever runs the app fixes what others registered: the name, the teachers and the rooms
	edit: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		if (me.role !== 'admin') error(404, 'Not found');
		const course = await usable(locals.db, me, params.id);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title || [...title].length > 60) return fail(400, { message: '授業名は1〜60文字で入れてください', edit: true });
		const teachers = [...new Set(String(form.get('teachers') ?? '').split(/[\n、,]/).map((t) => t.trim()))].filter(Boolean);
		if (teachers.length > 10 || teachers.some((t) => [...t].length > 30)) {
			return fail(400, { message: '先生は10人まで、名前は30文字までです', edit: true });
		}
		const rooms = form.getAll('room').map((r) => String(r).trim());
		if (rooms.some((r) => [...r].length > 20)) return fail(400, { message: '教室は20文字までです', edit: true });
		const written = writeShared(locals.db, {
			userId: me.id,
			universityId: course.universityId,
			year: course.year,
			termNames: course.terms,
			existing: course,
			values: {
				...course.values,
				title,
				teachers,
				slots: course.values.slots.map((slot, i) => ({ ...slot, room: rooms[i] || null }))
			}
		});
		if (!written.changed) return fail(400, { message: '変わったところがありません', edit: true });
		try {
			await locals.db.batch(written.statements as [(typeof written.statements)[number], ...(typeof written.statements)[number][]]);
		} catch {
			return fail(409, { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください', edit: true });
		}
		return { edited: true };
	},
	report: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		const message = await saveReport(locals.db, me.id, 'shared_course', course.id, await request.formData());
		if (message) return fail(400, { message });
		return { reported: true };
	}
};
