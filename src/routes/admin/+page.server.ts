import { error } from '@sveltejs/kit';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { hideCancellation, parseCancelTarget } from '$lib/server/cancellations';
import { monthDay } from '$lib/time';
import { feedback, groups, reports, sharedCourses, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Reports and feedback for whoever runs the app: users with role 'admin', set in D1 by hand
// (`update users set role = 'admin' where email = '…'`).
function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	return locals.user;
}

// Each list pages on its own (?reports=2, ?feedback=3), oldest open items included.
const PAGE = 50;
const pageOf = (url: URL, key: string) => Math.min(Math.max(Math.floor(Number(url.searchParams.get(key))) || 1, 1), 1000);

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const reportPage = pageOf(url, 'reports');
	const feedbackPage = pageOf(url, 'feedback');
	const [reportRows, feedbackRows, [reportTotal], [feedbackTotal]] = await locals.db.batch([
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
			.offset((reportPage - 1) * PAGE),
		locals.db
			.select({
				id: feedback.id,
				kind: feedback.kind,
				body: feedback.body,
				env: feedback.env,
				createdAt: feedback.createdAt,
				sender: users.nickname,
				senderEmail: users.email
			})
			.from(feedback)
			.leftJoin(users, eq(users.id, feedback.userId))
			.where(eq(feedback.status, 'open'))
			.orderBy(desc(feedback.createdAt), desc(feedback.id))
			.limit(PAGE)
			.offset((feedbackPage - 1) * PAGE),
		locals.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
		locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open'))
	]);

	// What each report is about, by name
	const ids = (type: string) => [...new Set(reportRows.filter((r) => r.targetType === type).map((r) => r.targetId))].slice(0, 90);
	const [people, groupRows, courseRows] = await Promise.all([
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
			: []
	]);
	// A shared cancellation is "授業名 10/7"
	const cancelTargets = reportRows.filter((r) => r.targetType === 'shared_cancel').flatMap((r) => {
		const t = parseCancelTarget(r.targetId);
		return t ? [t] : [];
	});
	const cancelCourses = cancelTargets.length
		? await locals.db
				.select({ id: sharedCourses.id, name: sharedCourses.title })
				.from(sharedCourses)
				.where(inArray(sharedCourses.id, [...new Set(cancelTargets.map((t) => t.sharedCourseId))].slice(0, 90)))
		: [];
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
		feedback: feedbackRows,
		pageSize: PAGE,
		reportPage,
		feedbackPage,
		reportTotal: reportTotal?.n ?? 0,
		feedbackTotal: feedbackTotal?.n ?? 0
	};
};

export const actions: Actions = {
	closeReport: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(reports).set({ status: 'closed' }).where(and(eq(reports.id, id), eq(reports.status, 'open')));
	},
	// Takes a shared cancellation down for everyone, and closes the reports about it
	hideCancel: async ({ locals, request }) => {
		requireAdmin(locals);
		await hideCancellation(locals.db, String((await request.formData()).get('targetId') ?? ''));
	},
	closeFeedback: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(feedback).set({ status: 'closed' }).where(and(eq(feedback.id, id), eq(feedback.status, 'open')));
	}
};
