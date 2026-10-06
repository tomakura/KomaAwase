import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { cancelMarkers, hideCancellation, parseCancelTarget } from '$lib/server/cancellations';
import { GROUP_NAME_MAX, deleteGroup, readGroupName, renameGroup } from '$lib/server/groups';
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
			? locals.db
					.select({ id: groups.id, name: groups.name, ownerId: groups.ownerId, owner: users.nickname })
					.from(groups)
					.leftJoin(users, eq(users.id, groups.ownerId))
					.where(inArray(groups.id, ids('group')))
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
	const owners = new Map(groupRows.map((g) => [g.id, g.ownerId ? { id: g.ownerId, nickname: g.owner } : null]));
	// Who marked each reported day as cancelled, for warning someone who did it as a prank
	const markers = new Map(
		await Promise.all(
			[...new Set(reportRows.filter((r) => r.targetType === 'shared_cancel').map((r) => r.targetId))].map(
				async (targetId) => [targetId, await cancelMarkers(locals.db, targetId)] as const
			)
		)
	);
	const cancelName = (targetId: string) => {
		const t = parseCancelTarget(targetId);
		const course = cancelCourses.find((c) => c.id === t?.sharedCourseId);
		return t && course ? `${course.name} ${monthDay(t.date)}` : undefined;
	};

	return {
		reports: reportRows.map((r) => ({
			...r,
			target: (r.targetType === 'shared_cancel' ? cancelName(r.targetId) : names.get(r.targetId)) ?? null,
			owner: r.targetType === 'group' ? (owners.get(r.targetId) ?? null) : null,
			markers: r.targetType === 'shared_cancel' ? (markers.get(r.targetId) ?? []) : []
		})),
		groupNameMax: GROUP_NAME_MAX,
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
	},
	// A reported group's name, changed by the admin; the reports about it are closed
	renameGroup: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = readGroupName(form.get('name'));
		if (!name) return fail(400, { message: `名前は1〜${GROUP_NAME_MAX}文字で入れてください`, id });
		await renameGroup(locals.db, id, name);
		await closeReportsAbout(locals.db, 'group', id);
		return { renamed: id };
	},
	// The group goes for everyone in it, and the reports about it are closed
	deleteGroup: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await deleteGroup(locals.db, id);
		await closeReportsAbout(locals.db, 'group', id);
	}
};

function closeReportsAbout(db: App.Locals['db'], targetType: 'group', targetId: string) {
	return db
		.update(reports)
		.set({ status: 'closed' })
		.where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, 'open')));
}
