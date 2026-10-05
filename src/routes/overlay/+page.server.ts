import { redirect } from '@sveltejs/kit';
import { and, eq, inArray, or } from 'drizzle-orm';
import { OVERLAY_COOKIE } from '$lib/overlay';
import { compareJa } from '$lib/sort';
import { requireUser } from '$lib/server/auth/next';
import { friendships, timetables } from '$lib/server/db/schema';
import { busyOnly } from '$lib/busy';
import { loadPeople, visibleLevels } from '$lib/server/friends';
import { groupsWithSharers } from '$lib/server/groups';
import { thisYear } from '$lib/server/setup';
import { currentTimetable, loadTimetables } from '$lib/server/timetable';
import type { PageServerLoad } from './$types';

const SELECTED_MAX = 20;

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const me = requireUser(locals, url);
	if (!me.setupAt) redirect(303, '/');
	const year = thisYear();
	const [mine, levels, groups, friendRows] = await Promise.all([
		currentTimetable(locals.db, me, locals.timetable),
		visibleLevels(locals.db, me.id),
		groupsWithSharers(locals.db, me.id),
		locals.db
			.select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
			.from(friendships)
			.where(
				and(
					eq(friendships.status, 'accepted'),
					or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id))
				)
			)
	]);
	const visible = new Set(levels.keys());
	const friendIds = new Set(friendRows.map((r) => (r.requesterId === me.id ? r.addresseeId : r.requesterId)));

	// Who to lay over, from ?with= or the last choice (the page keeps it in a cookie)
	const asked = (url.searchParams.get('with') ?? cookies.get(OVERLAY_COOKIE) ?? '').split(',');
	const selected = [...new Set(asked)].filter((id) => visible.has(id)).slice(0, SELECTED_MAX);

	const [people, loaded] = await Promise.all([
		loadPeople(locals.db, [...visible].slice(0, 300)),
		loadTimetables(
			locals.db,
			locals.db
				.select({ id: timetables.id })
				.from(timetables)
				.where(
					or(eq(timetables.id, mine.id), and(inArray(timetables.userId, selected), eq(timetables.year, year)))
				)
		)
	]);
	const byUser = new Map([...loaded].map(([id, t]) => [t.userId, id]));

	return {
		now: Date.now(),
		year,
		termParam: url.searchParams.get('term'),
		days: me.daysShown,
		me: { id: me.id, nickname: me.nickname, icon: me.icon, universityId: mine.universityId },
		mine: loaded.get(mine.id)!,
		people: people
			.map(({ daysShown: _, ...p }) => ({ ...p, friend: friendIds.has(p.id) }))
			.sort((a, b) => Number(b.friend) - Number(a.friend) || compareJa(a.nickname ?? '', b.nickname ?? '')),
		groups: groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => visible.has(id)) })),
		selected,
		// null: no timetable for this year yet
		timetables: Object.fromEntries(
			selected.map((id) => {
				const t = loaded.get(byUser.get(id) ?? '');
				// Someone who shows only when they are busy: no classes leave the server
				return [id, t && levels.get(id) === 'free' ? { ...t, courses: busyOnly(t.courses) } : (t ?? null)];
			})
		)
	};
};
