import { error, fail, redirect } from '@sveltejs/kit';
import { rememberNext, requireUser } from '$lib/server/auth/next';
import { readCode } from '$lib/server/friends';
import { findGroupByInvite, joinGroup, loadGroup, membership, memberCount, otherMembers } from '$lib/server/groups';
import { notifyLater } from '$lib/server/notify';
import type { Actions, PageServerLoad } from './$types';

async function invited(db: App.Locals['db'], code: string) {
	const valid = readCode(code);
	const group = valid ? await findGroupByInvite(db, valid) : undefined;
	if (!group) error(404, 'この招待リンクは使えません。作り直されたか、まちがっているかもしれません');
	return group;
}

// A group invite: what the group is, and whether to show one's timetable to it
export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	const me = requireUser(locals, url);
	if (!me.setupAt) {
		rememberNext(cookies, url.pathname);
		redirect(303, '/');
	}
	const group = await invited(locals.db, params.code);
	if (await membership(locals.db, group.id, me.id)) redirect(303, `/groups/${group.id}`);
	return { name: group.name, members: await memberCount(locals.db, group.id) };
};

export const actions: Actions = {
	default: async ({ locals, params, url, request, platform }) => {
		const me = requireUser(locals, url);
		const group = await invited(locals.db, params.code);
		const share = (await request.formData()).get('share') === 'on';
		const joined = await joinGroup(locals.db, group.id, me.id, share);
		if (joined === 'full') return fail(400, { message: 'このグループは人数がいっぱいです' });
		if (joined === 'joined') {
			notifyLater(platform, locals.db, await otherMembers(locals.db, group.id, me.id), 'groupJoin', {
				title: `${me.nickname ?? 'だれか'}さんが「${group.name}」に参加しました`,
				url: `/groups/${group.id}`,
				tag: `group-${group.id}`
			});
		}
		// A member can't be missing here, but a group deleted in between would be.
		if (!(await loadGroup(locals.db, group.id, me.id))) error(404, 'グループが見つかりません');
		redirect(303, `/groups/${group.id}`);
	}
};
