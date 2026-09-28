import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import { COURSE_COLORS } from '$lib/courses';
import { IMPORT_COURSES_MAX, groupImported } from '$lib/import';
import { normalizeTitle } from '$lib/overlay';
import { requireUser } from '$lib/server/auth/next';
import { nextColor, parseCourseForm, saveCourse, shapeOf } from '$lib/server/courses';
import { importJobs, sharedCourseSlots, sharedCourses, timetables } from '$lib/server/db/schema';
import { loadSharedCourses } from '$lib/server/shared-courses';
import { loadShape, loadTimetable } from '$lib/server/timetable';
import { currentTerm } from '$lib/terms';
import { tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

async function ownJob(db: App.Locals['db'], userId: string, id: string) {
	const row = await db
		.select({ job: importJobs, timetable: { id: timetables.id, year: timetables.year, universityId: timetables.universityId } })
		.from(importJobs)
		.innerJoin(timetables, eq(timetables.id, importJobs.timetableId))
		.where(and(eq(importJobs.id, id), eq(importJobs.userId, userId)))
		.get();
	if (!row) error(404, '読み込みが見つかりません');
	return row;
}

// Shared courses at the slots that were read, best matches first
async function suggestions(
	db: App.Locals['db'],
	timetable: { year: number; universityId: string | null },
	groups: ReturnType<typeof groupImported>
) {
	const pairs = [...new Set(groups.flatMap((g) => g.slots.map((s) => `${s.weekday}-${s.period}`)))].slice(0, 40);
	if (!timetable.universityId || !pairs.length) return groups.map(() => []);
	const rows = await db
		.selectDistinct({ id: sharedCourses.id, weekday: sharedCourseSlots.weekday, period: sharedCourseSlots.periodNumber })
		.from(sharedCourseSlots)
		.innerJoin(sharedCourses, eq(sharedCourses.id, sharedCourseSlots.sharedCourseId))
		.where(
			and(
				eq(sharedCourses.universityId, timetable.universityId),
				eq(sharedCourses.year, timetable.year),
				or(
					...pairs.map((p) => {
						const [w, n] = p.split('-').map(Number);
						return and(eq(sharedCourseSlots.weekday, w), eq(sharedCourseSlots.periodNumber, n));
					})
				)
			)
		);
	const shared = await loadSharedCourses(
		db,
		rows.map((r) => r.id)
	);
	return groups.map((g) => {
		const here = new Set(
			rows.filter((r) => g.slots.some((s) => s.weekday === r.weekday && s.period === r.period)).map((r) => r.id)
		);
		const title = normalizeTitle(g.title);
		return [...here]
			.flatMap((id) => {
				const course = shared.get(id);
				if (!course) return [];
				const other = normalizeTitle(course.values.title);
				const score = other === title ? 3 : other.includes(title) || title.includes(other) ? 2 : 1;
				return [{ id, version: course.version, score, ...course.values }];
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);
	});
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const { job, timetable } = await ownJob(locals.db, me.id, params.id);
	const today = tokyoTime(Date.now()).date;
	const groups = groupImported(job.result ?? []);
	const [loaded, suggested] = await Promise.all([
		loadTimetable(locals.db, timetable.id, today),
		suggestions(locals.db, timetable, groups)
	]);
	return {
		job: { id: job.id, status: job.status, closed: !!job.closedAt, provider: job.provider },
		terms: loaded.terms,
		periods: loaded.periods,
		defaultTerm: currentTerm(loaded.terms, today)?.id ?? null,
		// What is already in each term, to point out slots that are taken
		taken: loaded.courses.flatMap((c) => c.slots.map((s) => ({ ...s, title: c.title, termIds: c.termIds }))),
		groups: groups.map((g, i) => ({ ...g, suggestions: suggested[i] }))
	};
};

type Row = {
	title: string;
	teachers: string[];
	slots: { weekday: number; period: number; span: number; room: string }[];
	sharedId: string | null;
};

export const actions: Actions = {
	save: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const { job, timetable } = await ownJob(locals.db, me.id, params.id);
		if (job.closedAt) redirect(303, '/');
		const form = await request.formData();
		let raw: unknown;
		try {
			raw = JSON.parse(String(form.get('rows') ?? '[]'));
		} catch {
			return fail(400, { message: '入力を読み取れませんでした。もう一度お試しください' });
		}
		if (!Array.isArray(raw) || !raw.length) return fail(400, { message: '追加する授業を1つ以上選んでください' });
		// Checked field by field again below (parseCourseForm); here only the shape
		const rows: Row[] = raw.slice(0, IMPORT_COURSES_MAX).map((r) => ({
			title: typeof r?.title === 'string' ? r.title : '',
			teachers: Array.isArray(r?.teachers) ? r.teachers.filter((t: unknown) => typeof t === 'string') : [],
			slots: Array.isArray(r?.slots) ? r.slots : [],
			sharedId: typeof r?.sharedId === 'string' ? r.sharedId : null
		}));
		const termIds = form.getAll('term').map(String);
		const sync = form.get('sync') === 'on';

		const shape = await loadShape(locals.db, timetable.id);
		const shared = await loadSharedCourses(
			locals.db,
			rows.flatMap((r) => (r.sharedId ? [r.sharedId] : []))
		);
		const colors = COURSE_COLORS.filter((c) => c.id !== 'gray').map((c) => c.id);
		const first = colors.indexOf((await nextColor(locals.db, timetable.id)) as (typeof colors)[number]);

		// Every course is checked before any is saved, so a mistake doesn't leave half an import.
		const inputs = [];
		for (const [i, row] of rows.entries()) {
			const linked = row.sharedId ? shared.get(row.sharedId) : undefined;
			// Linked to a shared course: its own values, so a misread never overwrites it
			const values = linked ? linked.values : { ...row, slots: row.slots.map((s) => ({ ...s, room: s.room || null })) };
			const fd = new FormData();
			fd.set('title', values.title);
			for (const t of values.teachers) fd.append('teacher', t);
			fd.set('color', colors[(first + i) % colors.length]);
			for (const id of termIds) fd.append('term', id);
			for (const s of values.slots) fd.append('slot', JSON.stringify(s));
			fd.set('sync', linked || sync ? 'synced' : 'personal');
			if (linked) {
				fd.set('shared_id', linked.id);
				fd.set('shared_version', String(linked.version));
			}
			const parsed = parseCourseForm(fd, shapeOf(shape));
			if ('message' in parsed) return fail(400, { message: `${i + 1}つめ（${values.title || '名前なし'}）：${parsed.message}` });
			inputs.push(parsed.input);
		}

		for (const input of inputs) {
			const saved = await saveCourse(locals.db, { userId: me.id, timetable, terms: shape.terms, courseId: null, input });
			if ('message' in saved) return fail(409, { message: saved.message });
		}
		await locals.db.update(importJobs).set({ closedAt: new Date() }).where(eq(importJobs.id, job.id));
		redirect(303, termIds[0] ? `/?term=${encodeURIComponent(termIds[0])}` : '/');
	},
	dismiss: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		const { job } = await ownJob(locals.db, me.id, params.id);
		await locals.db.update(importJobs).set({ closedAt: new Date() }).where(eq(importJobs.id, job.id));
		redirect(303, '/import');
	}
};
