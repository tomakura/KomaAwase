import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { requireAdmin } from '$lib/server/auth/reauth';
import { sharedCourses, universities } from '$lib/server/db/schema';
import { loadSharedCourses } from '$lib/server/shared-courses';
import { importBatches, parseSyllabusFile, planImport, type ImportPlan } from '$lib/server/syllabus';
import { slotText } from '$lib/shared-changes';
import { deliveryLabel } from '$lib/courses';
import type { Actions, PageServerLoad } from './$types';

// シラバスの取り込み: the file scripts/syllabus writes, checked first (what is added, what
// changes, what the syllabus no longer has), then applied to the university's shared courses.
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const list = await locals.db
		.select({ id: universities.id, name: universities.name })
		.from(universities)
		.where(eq(universities.source, 'preset'))
		.orderBy(asc(universities.name));
	return { universities: list };
};

type Read = { plan: ImportPlan; universityId: string; warnings: string[] } | { message: string };

async function readFile(locals: App.Locals, form: FormData): Promise<Read> {
	const universityId = String(form.get('university') ?? '');
	const university = await locals.db.select().from(universities).where(eq(universities.id, universityId)).get();
	if (!university || university.source !== 'preset') return { message: '大学を選んでください' };
	let raw: unknown;
	try {
		raw = JSON.parse(String(form.get('file') ?? ''));
	} catch {
		return { message: 'ファイルを読めませんでした。scripts/syllabus で書き出した JSON を選んでください' };
	}
	const file = parseSyllabusFile(raw);
	if ('message' in file) return file;
	const rows = await locals.db
		.select({ id: sharedCourses.id })
		.from(sharedCourses)
		.where(and(eq(sharedCourses.universityId, universityId), eq(sharedCourses.year, file.year)));
	const existing = [...(await loadSharedCourses(locals.db, rows.map((r) => r.id))).values()];
	const plan = planImport(file, existing);
	if ('message' in plan) return plan;

	// What the timetables of that university can't show
	const termNames = new Set(university.termPreset?.map((t) => t.name) ?? []);
	const periods = new Set(university.periodPreset?.map((p) => p.number) ?? []);
	const warnings: string[] = [];
	const badTerms = file.courses.filter((c) => c.terms.some((t) => !termNames.has(t)));
	if (badTerms.length) warnings.push(`学期の名前がこの大学の学期と合わない授業が${badTerms.length}件あります（${badTerms[0].code} など）`);
	const badPeriods = file.courses.filter((c) => c.slots.some((s) => !periods.has(s.period) || !periods.has(s.period + s.span - 1)));
	if (badPeriods.length) warnings.push(`この大学にない時限の授業が${badPeriods.length}件あります（${badPeriods[0].code} など）`);
	return { plan, universityId, warnings };
}

// The plan as the page lists it
function summary(plan: ImportPlan) {
	const when = (c: ImportPlan['add'][number]) =>
		c.slots.map((s) => slotText({ ...s, room: null })).join('、') || deliveryLabel(c.delivery, c.intensiveFrom, c.intensiveTo) || '';
	const line = (c: ImportPlan['add'][number]) => ({ code: c.code, title: c.title, detail: [c.terms.join('・'), when(c), c.teachers.join('・')].filter(Boolean).join(' · ') });
	return {
		year: plan.year,
		add: plan.add.map(line),
		update: plan.update.map((u) => ({ ...line(u.course), changes: u.changes })),
		link: plan.link.map((l) => ({ ...line(l.course), from: l.existing.values.title, changes: l.changes })),
		same: plan.same.length,
		missing: plan.missing.map((m) => ({ code: m.code ?? '', title: m.values.title, detail: m.terms.join('・') })),
		roomsKept: plan.roomsKept.map((k) => ({
			code: `${k.course.code} ${slotText({ ...k.slot, room: null })}`,
			title: k.course.title,
			detail: `今の教室：${k.room} · ファイル：${k.slot.room}`
		}))
	};
}

export const actions: Actions = {
	check: async ({ locals, url, request }) => {
		await requireAdmin(locals, url);
		const read = await readFile(locals, await request.formData());
		if ('message' in read) return fail(400, { message: read.message });
		return { checked: summary(read.plan), warnings: read.warnings };
	},
	apply: async ({ locals, url, request }) => {
		await requireAdmin(locals, url);
		const read = await readFile(locals, await request.formData());
		if ('message' in read) return fail(400, { message: read.message });
		const batches = await importBatches(locals.db, read.plan, read.universityId);
		let done = 0;
		for (const batch of batches) {
			try {
				await locals.db.batch(batch as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
			} catch (e) {
				console.error('syllabus import stopped', e);
				return fail(409, {
					message: `途中で止まりました（${done}/${batches.length}）。だれかが同じ授業を直したのかもしれません。もう一度「確かめる」から進めると、残りを取り込めます`
				});
			}
			done += 1;
		}
		return {
			applied: { add: read.plan.add.length, update: read.plan.update.length, link: read.plan.link.length, same: read.plan.same.length }
		};
	}
};
