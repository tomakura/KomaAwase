import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { contactMessages, feedback, groups, reports, sharedCourses, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Contact messages, reports and feedback for whoever runs the app: users with role 'admin', set in D1 by hand
// (`update users set role = 'admin' where email = '…'`).

// Each list pages on its own (?contact=2, ?reports=2, ?feedback=3), oldest open items included.
const PAGE = 50;
const pageOf = (url: URL, key: string) => Math.min(Math.max(Math.floor(Number(url.searchParams.get(key))) || 1, 1), 1000);

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const reportPage = pageOf(url, 'reports');
	const feedbackPage = pageOf(url, 'feedback');
	const contactPage = pageOf(url, 'contact');
	const [contactRows, reportRows, feedbackRows, [contactTotal], [reportTotal], [feedbackTotal]] = await locals.db.batch([
		locals.db
			.select({
				id: contactMessages.id,
				name: contactMessages.name,
				email: contactMessages.email,
				body: contactMessages.body,
				createdAt: contactMessages.createdAt
			})
			.from(contactMessages)
			.where(eq(contactMessages.status, 'open'))
			.orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
			.limit(PAGE)
			.offset((contactPage - 1) * PAGE),
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
		locals.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'open')),
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
	const names = new Map([...people, ...groupRows, ...courseRows].map((r) => [r.id, r.name]));

	return {
		contact: contactRows,
		reports: reportRows.map((r) => ({ ...r, target: names.get(r.targetId) ?? '（消えています）' })),
		feedback: feedbackRows,
		pageSize: PAGE,
		contactPage,
		reportPage,
		feedbackPage,
		contactTotal: contactTotal?.n ?? 0,
		reportTotal: reportTotal?.n ?? 0,
		feedbackTotal: feedbackTotal?.n ?? 0
	};
};

export const actions: Actions = {
	closeContact: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db
			.update(contactMessages)
			.set({ status: 'closed' })
			.where(and(eq(contactMessages.id, id), eq(contactMessages.status, 'open')));
	},
	closeReport: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(reports).set({ status: 'closed' }).where(and(eq(reports.id, id), eq(reports.status, 'open')));
	},
	closeFeedback: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(feedback).set({ status: 'closed' }).where(and(eq(feedback.id, id), eq(feedback.status, 'open')));
	}
};
