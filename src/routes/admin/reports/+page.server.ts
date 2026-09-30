import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { hideCancellation, parseCancelTarget } from '$lib/server/cancellations';
import { monthDay } from '$lib/time';
import { groups, reports, sharedCourses, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Pages by ?page=2, oldest open items included.
const PAGE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), 1000);
	const [reportRows, [total]] = await locals.db.batch([
		locals.db
			.select({
				id: reports.id,
				targetType: reports.targetType,
				targetId: reports.targetId,
				reason: reports.reason,
				detail: reports.detail,
				createdAt: reports.createdAt,
				reporter: users.nickname,
				reporterEmail: users.email
			})
			.from(reports)
			.leftJoin(users, eq(users.id, reports.reporterId))
			.where(eq(reports.status, 'open'))
			.orderBy(desc(reports.createdAt), desc(reports.id))
			.limit(PAGE)
			.offset((page - 1) * PAGE),
		locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open'))
	]);

	// What each report is about, by name
	const ids = (type: string) => [...new Set(reportRows.filter((r) => r.targetType === type).map((r) => r.targetId))].slice(0, 90);
	// A shared cancellation is "授業名 10/7"
	const cancelTargets = reportRows
		.filter((r) => r.targetType === 'shared_cancel')
		.flatMap((r) => {
			const t = parseCancelTarget(r.targetId);
			return t ? [t] : [];
		});
	const [people, groupRows, courseRows, cancelCourses] = await Promise.all([
		ids('user').length
			? locals.db.select({ id: users.id, name: users.nickname }).from(users).where(inArray(users.id, ids('user')))
			: [],
		ids('group').length
			? locals.db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, ids('group')))
			: [],
		ids('shared_course').length
			? locals.db
					.select({ id: sharedCourses.id, name: sharedCourses.title })
					.from(sharedCourses)
					.where(inArray(sharedCourses.id, ids('shared_course')))
			: [],
		cancelTargets.length
			? locals.db
					.select({ id: sharedCourses.id, name: sharedCourses.title })
					.from(sharedCourses)
					.where(inArray(sharedCourses.id, [...new Set(cancelTargets.map((t) => t.sharedCourseId))].slice(0, 90)))
			: []
	]);
	const names = new Map([...people, ...groupRows, ...courseRows].map((r) => [r.id, r.name]));
	const cancelName = (targetId: string) => {
		const t = parseCancelTarget(targetId);
		const course = cancelCourses.find((c) => c.id === t?.sharedCourseId);
		return t && course ? `${course.name} ${monthDay(t.date)}` : undefined;
	};

	return {
		reports: reportRows.map((r) => ({
			...r,
			target: (r.targetType === 'shared_cancel' ? cancelName(r.targetId) : names.get(r.targetId)) ?? '（消えています）'
		})),
		pageSize: PAGE,
		page,
		total: total?.n ?? 0
	};
};

export const actions: Actions = {
	closeReport: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(reports).set({ status: 'closed' }).where(and(eq(reports.id, id), eq(reports.status, 'open')));
	},
	// Takes a shared cancellation down for everyone, and closes the reports about it
	hideCancel: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		await hideCancellation(locals.db, String((await request.formData()).get('targetId') ?? ''));
	}
};
