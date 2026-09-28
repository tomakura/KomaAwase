import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { feedback, groups, reports, sharedCourses, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Reports and feedback for whoever runs the app: users with role 'admin', set in D1 by hand
// (`update users set role = 'admin' where email = '…'`).
function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [reportRows, feedbackRows] = await locals.db.batch([
		locals.db
			.select({
				id: reports.id,
				targetType: reports.targetType,
				targetId: reports.targetId,
				reason: reports.reason,
				detail: reports.detail,
				createdAt: reports.createdAt,
				reporter: users.nickname
			})
			.from(reports)
			.leftJoin(users, eq(users.id, reports.reporterId))
			.where(eq(reports.status, 'open'))
			.orderBy(desc(reports.createdAt))
			.limit(100),
		locals.db
			.select({
				id: feedback.id,
				kind: feedback.kind,
				body: feedback.body,
				env: feedback.env,
				createdAt: feedback.createdAt,
				sender: users.nickname
			})
			.from(feedback)
			.leftJoin(users, eq(users.id, feedback.userId))
			.where(eq(feedback.status, 'open'))
			.orderBy(desc(feedback.createdAt))
			.limit(100)
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
	const names = new Map([...people, ...groupRows, ...courseRows].map((r) => [r.id, r.name]));

	return {
		reports: reportRows.map((r) => ({ ...r, target: names.get(r.targetId) ?? '（消えています）' })),
		feedback: feedbackRows
	};
};

export const actions: Actions = {
	closeReport: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(reports).set({ status: 'closed' }).where(and(eq(reports.id, id), eq(reports.status, 'open')));
	},
	closeFeedback: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(feedback).set({ status: 'closed' }).where(and(eq(feedback.id, id), eq(feedback.status, 'open')));
	}
};
