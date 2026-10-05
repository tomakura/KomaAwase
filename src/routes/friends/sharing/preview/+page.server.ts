import { error, redirect } from '@sveltejs/kit';
import { busyOnly } from '$lib/busy';
import { listMyGroups } from '$lib/server/groups';
import { currentTimetable, loadTimetable } from '$lib/server/timetable';
import { choiceOf } from '$lib/sharing';
import { tokyoTime } from '$lib/time';
import type { PageServerLoad } from './$types';

// 相手からの見え方 (A18): one's own timetable as friends, or a group, get it. Only one's own data.
export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user;
	if (!me) redirect(303, '/login');
	const as = url.searchParams.get('as') ?? 'friends';
	const groups = await listMyGroups(locals.db, me.id);
	const group = as === 'friends' ? null : groups.find((g) => g.id === as);
	if (as !== 'friends' && !group) error(404, 'グループが見つかりません');
	const share = group ? choiceOf({ shareTimetable: group.share, freeOnly: group.freeOnly }) : me.friendShare;

	const now = Date.now();
	const timetable = await currentTimetable(locals.db, me, locals.timetable);
	const loaded = share === 'none' ? null : await loadTimetable(locals.db, timetable.id, tokyoTime(now).date);
	// The same as others get from /friends/[id]
	const courses = (loaded?.courses ?? []).map(({ cancels: _, maybeCancels: __, moves: ___, ...c }) => c);
	return {
		now,
		year: timetable.year,
		as,
		share,
		audiences: [{ id: 'friends', name: '友だち' }, ...groups.map((g) => ({ id: g.id, name: g.name }))],
		me: { nickname: me.nickname, icon: me.icon },
		days: me.daysShown,
		terms: loaded?.terms ?? [],
		periods: loaded?.periods ?? [],
		courses: share === 'free' ? busyOnly(courses) : courses
	};
};
