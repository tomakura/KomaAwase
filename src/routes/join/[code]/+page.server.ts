import { error, fail, redirect } from '@sveltejs/kit';
import { rememberNext, requireUser } from '$lib/server/auth/next';
import { readCode } from '$lib/server/friends';
import {
	cancelRequest,
	findGroupByInvite,
	isBanned,
	joinGroup,
	loadGroup,
	membership,
	memberCount,
	otherMembers,
	requestOf,
	requestToJoin
} from '$lib/server/groups';
import { notifyLater } from '$lib/server/notify';
import type { Actions, PageServerLoad } from './$types';

async function invited(db: App.Locals['db'], code: string) {
	const valid = readCode(code);
	const group = valid ? await findGroupByInvite(db, valid) : undefined;
	if (!group) error(404, 'この招待リンクは使えません。作り直されたか、まちがっているかもしれません');
	return group;
}

// A group invite: what the group is, and whether to show one's timetable to it. A group that
// needs approval takes a request instead; someone the owner made leave can't come back.
export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	const me = requireUser(locals, url);
	if (!me.setupAt) {
		rememberNext(cookies, url.pathname);
		redirect(303, '/');
	}
	const group = await invited(locals.db, params.code);
	if (await membership(locals.db, group.id, me.id)) redirect(303, `/groups/${group.id}`);
	const [members, banned, request] = await Promise.all([
		memberCount(locals.db, group.id),
		isBanned(locals.db, group.id, me.id),
		requestOf(locals.db, group.id, me.id)
	]);
	return { name: group.name, members, approval: group.approval, banned, requested: !!request };
};

export const actions: Actions = {
	join: async ({ locals, params, url, request, platform }) => {
		const me = requireUser(locals, url);
		const group = await invited(locals.db, params.code);
		if (await isBanned(locals.db, group.id, me.id)) return fail(403, { message: 'この招待からは参加できません。招待した人にご確認ください。' });
		const share = (await request.formData()).get('share') === 'on';
		if (group.approval) {
			const asked = !!(await requestOf(locals.db, group.id, me.id));
			await requestToJoin(locals.db, group.id, me.id, share);
			if (!asked && group.ownerId) {
				notifyLater(platform, locals.db, [group.ownerId], 'groupRequest', {
					title: `${me.nickname ?? 'だれか'}さんが「${group.name}」に参加を申請しました`,
					url: `/groups/${group.id}`,
					tag: `group-request-${group.id}`
				});
			}
			return { requested: true };
		}
		const joined = await joinGroup(locals.db, group.id, me.id, share);
		if (joined === 'full') return fail(400, { message: 'このグループは人数がいっぱいです' });
		// A request left from when the group needed approval
		await cancelRequest(locals.db, group.id, me.id);
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
	},
	cancel: async ({ locals, params, url }) => {
		const me = requireUser(locals, url);
		const group = await invited(locals.db, params.code);
		await cancelRequest(locals.db, group.id, me.id);
		return { cancelled: true };
	}
};
