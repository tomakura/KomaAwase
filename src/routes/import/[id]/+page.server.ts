import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { groupImported } from '$lib/import';
import { requireUser } from '$lib/server/auth/next';
import { importJobs, timetables } from '$lib/server/db/schema';
import { reviewBase, saveReviewed, suggestions } from '$lib/server/import/review';
import { sharedAccess } from '$lib/server/verify';
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

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const { job, timetable } = await ownJob(locals.db, me.id, params.id);
	const today = tokyoTime(Date.now()).date;
	const groups = groupImported(job.result ?? []);
	// Shared courses are suggested to people with an enrollment check only
	const access = await sharedAccess(locals.db, me.id, timetable.universityId);
	const [base, suggested] = await Promise.all([
		reviewBase(locals.db, timetable, today),
		access === 'ok' ? suggestions(locals.db, timetable, groups) : groups.map(() => [])
	]);
	return {
		canShare: access === 'ok',
		job: { id: job.id, status: job.status, closed: !!job.closedAt, provider: job.provider },
		...base,
		// The term the screenshot was sent from, else the one running now
		defaultTerm: base.terms.find((t) => t.id === job.termId)?.id ?? currentTerm(base.terms, today)?.id ?? null,
		groups: groups.map((g, i) => ({ ...g, suggestions: suggested[i] }))
	};
};

export const actions: Actions = {
	save: async ({ locals, params, url, request }) => {
		const me = requireUser(locals, url);
		const { job, timetable } = await ownJob(locals.db, me.id, params.id);
		if (job.closedAt) redirect(303, '/');
		const form = await request.formData();
		// The job is closed in the same batch: a second save of this import (another tab) stops
		// at the guard, which rolls the whole batch back.
		let saved;
		try {
			saved = await saveReviewed(locals.db, me.id, timetable, form, [
				locals.db
					.update(importJobs)
					.set({ closedAt: new Date() })
					.where(and(eq(importJobs.id, job.id), isNull(importJobs.closedAt))),
				locals.db.run(sql`select json(case when changes() = 1 then 'true' else 'already saved' end)`)
			]);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			const now = await locals.db.select({ closedAt: importJobs.closedAt }).from(importJobs).where(eq(importJobs.id, job.id)).get();
			if (now?.closedAt) redirect(303, '/');
			throw e;
		}
		if ('status' in saved) return saved;
		redirect(303, saved.termId ? `/?term=${encodeURIComponent(saved.termId)}` : '/');
	},
	dismiss: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		const { job } = await ownJob(locals.db, me.id, params.id);
		await locals.db.update(importJobs).set({ closedAt: new Date() }).where(eq(importJobs.id, job.id));
		redirect(303, '/import');
	}
};
