import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { timetables, universities } from '$lib/server/db/schema';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import {
	adminSearchShared,
	canEditShared,
	loadEdits,
	loadSharedCourse,
	mergePreview,
	mergeShared,
	removePreview,
	removeShared,
	restoreShared,
	sharedCreator,
	syncedCount,
	usageCounts,
	writeShared
} from '$lib/server/shared-courses';
import { deleteCourseFiles } from '$lib/server/files';
import { readWarning } from '$lib/moderation';
import { sharedAccess } from '$lib/server/verify';
import { notifySharedChanged } from '$lib/server/shared-notify';
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
	// The admin folds this course into another one (授業をほかの授業と同期させる): pick it by a
	// search (?merge=), then see who it reaches (?into=)
	const isAdmin = me.role === 'admin';
	const mergeQuery = isAdmin ? url.searchParams.get('merge') : null;
	const intoId = isAdmin ? url.searchParams.get('into') : null;
	const into = intoId && intoId !== course.id ? await loadSharedCourse(locals.db, intoId) : null;
	const target = into && into.universityId === course.universityId && into.year === course.year ? into : null;
	const [candidates, preview] = await Promise.all([
		mergeQuery !== null
			? adminSearchShared(locals.db, {
					universityId: course.universityId,
					year: course.year,
					q: mergeQuery.trim().slice(0, 50),
					excludeId: course.id
				})
			: [],
		target ? mergePreview(locals.db, course.id, target.id) : null
	]);
	const using = isAdmin ? ((await usageCounts(locals.db, [course.id])).get(course.id)?.linked ?? 0) : 0;
	// For the admin: who added it, and who a delete reaches
	const creator = isAdmin ? await sharedCreator(locals.db, course.id) : null;
	const reach = isAdmin ? await removePreview(locals.db, course.id, creator?.id ?? null) : null;
	return {
		using,
		creator,
		removal: reach && { creatorHas: reach.creatorCourses.length > 0, others: reach.others },
		merge: isAdmin
			? {
					query: mergeQuery,
					candidates: candidates.map((c) => ({ id: c.id, version: c.version, users: c.users, using: c.using, source: c.source, values: c.values })),
					target: target && preview ? { id: target.id, version: target.version, values: target.values, ...preview } : null
				}
			: null,
		back: safeNext(url.searchParams.get('back')) ?? '/',
		course: {
			id: course.id,
			source: course.source,
			version: course.version,
			createdAt: course.createdAt,
			updatedAt: course.updatedAt,
			year: course.year,
			terms: course.terms,
			university: university?.name ?? '',
			values: course.values
		},
		users,
		canEdit,
		isAdmin,
		// Who made each change is shown to the admin only
		edits: history.edits.map((e) => ({
			id: e.id,
			createdAt: e.createdAt,
			diff: e.diff,
			by: isAdmin ? { id: e.userId, nickname: e.nickname } : null
		})),
		page,
		more: history.more,
		reportReasons: REPORT_REASONS.shared_course
	};
};

export const actions: Actions = {
	restore: async ({ locals, params, url, request, platform }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		if (!(await canEditShared(locals.db, me.id, course))) {
			return fail(403, { message: 'この授業を同期していて在籍確認済みの人が元に戻せます' });
		}
		const form = await request.formData();
		const result = await restoreShared(locals.db, {
			userId: me.id,
			course,
			editId: String(form.get('edit') ?? ''),
			version: Number(form.get('version'))
		});
		if ('message' in result) return fail(409, { message: result.message });
		notifySharedChanged(platform, locals.db, me.id, [course.id]);
		return { restored: true };
	},
	// Whoever runs the app fixes what others registered: the name, the teachers and the rooms
	edit: async ({ locals, params, url, request, platform }) => {
		const me = await requireAdmin(locals, url);
		const course = await usable(locals.db, me, params.id);
		const form = await request.formData();
		// The version the form was opened at: someone may have changed the course since
		if (Number(form.get('version')) !== course.version) {
			return fail(409, { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください', edit: true });
		}
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
		notifySharedChanged(platform, locals.db, me.id, [course.id]);
		return { edited: true };
	},
	// Fold this course into another: everyone syncing it syncs the other, and this one is deleted
	merge: async ({ locals, params, url, request }) => {
		const me = await requireAdmin(locals, url);
		const course = await usable(locals.db, me, params.id);
		const form = await request.formData();
		const into = await loadSharedCourse(locals.db, String(form.get('into') ?? ''));
		if (!into || into.id === course.id || into.universityId !== course.universityId || into.year !== course.year) {
			return fail(400, { message: '同期させる授業が見つかりません。選び直してください', merge: true });
		}
		// The versions the confirmation showed: if either changed since, nothing is merged
		if (Number(form.get('version')) !== course.version || Number(form.get('into_version')) !== into.version) {
			return fail(409, { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください', merge: true });
		}
		try {
			const statements = mergeShared(locals.db, course, into);
			await locals.db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
		} catch (e) {
			console.error('shared course merge failed', e);
			return fail(409, { message: '同期させられませんでした。読み込み直してから、もう一度やり直してください', merge: true });
		}
		redirect(303, `/shared/${into.id}?back=${encodeURIComponent(safeNext(String(form.get('back') ?? '')) ?? '/')}&merged=1`);
	},
	// Take the course down whoever has it: the creator's copies go, everyone else keeps theirs as
	// 自分だけで使う. A warning can go to the creator at the same time.
	remove: async ({ locals, params, url, request, platform }) => {
		const me = await requireAdmin(locals, url);
		if (!platform) error(500);
		const course = await usable(locals.db, me, params.id);
		const form = await request.formData();
		if (Number(form.get('version')) !== course.version) {
			return fail(409, { message: 'ほかの人が先に直しました。読み込み直してから、もう一度やり直してください', remove: true });
		}
		const creator = await sharedCreator(locals.db, course.id);
		let warning: string | null = null;
		if (creator && form.get('warn') === 'on') {
			const read = readWarning(form.get('warning'));
			if ('message' in read) return fail(400, { message: read.message, remove: true });
			warning = read.body;
		}
		// The creator's copies are deleted, so their files go first
		const { creatorCourses } = await removePreview(locals.db, course.id, creator?.id ?? null);
		for (const id of creatorCourses) {
			if ((await deleteCourseFiles(platform.env, locals.db, id)) > 0) {
				return fail(409, { message: '資料が多いので、一部だけ消しました。もう一度「この授業を削除する」を押してください', remove: true });
			}
		}
		try {
			const statements = removeShared(locals.db, course, { creatorId: creator?.id ?? null, warning, adminId: me.id });
			await locals.db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
		} catch (e) {
			console.error('shared course delete failed', e);
			return fail(409, { message: '削除できませんでした。読み込み直してから、もう一度やり直してください', remove: true });
		}
		redirect(303, '/admin/courses?removed=1');
	},
	report: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const course = await usable(locals.db, me, params.id);
		const message = await saveReport(locals.db, me.id, 'shared_course', course.id, await request.formData());
		if (message) return fail(400, { message });
		return { reported: true };
	}
};
