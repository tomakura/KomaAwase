import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/next';
import { visibleUserIds } from '$lib/server/friends';
import {
	GROUP_NAME_MAX,
	deleteGroup,
	isOwner,
	leaveGroup,
	loadGroup,
	readGroupName,
	regenerateInvite,
	removeMember,
	renameGroup,
	setShare
} from '$lib/server/groups';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import { verifiedIds } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const [loaded, visible] = await Promise.all([loadGroup(locals.db, params.id, me.id), visibleUserIds(locals.db, me.id)]);
	if (!loaded) error(404, 'グループが見つかりません');
	const { group, members } = loaded;
	const verified = await verifiedIds(
		locals.db,
		members.map((m) => m.id)
	);
	return {
		group: { id: group.id, name: group.name },
		isOwner: isOwner(group, me.id),
		meId: me.id,
		invite: `${url.origin}/join/${group.inviteCode}`,
		share: members.find((m) => m.id === me.id)?.shareTimetable ?? true,
		members: members.map(({ joinedAt: _, ...m }) => ({
			...m,
			owner: m.id === group.ownerId,
			verified: verified.has(m.id),
			// Whose timetable opens from here: shown to the group and not blocked either way
			visible: m.id !== me.id && visible.has(m.id)
		})),
		reportReasons: REPORT_REASONS.group
	};
};

async function member(event: RequestEvent<{ id: string }>) {
	const me = requireUser(event.locals, event.url);
	const loaded = await loadGroup(event.locals.db, event.params.id, me.id);
	if (!loaded) error(404, 'グループが見つかりません');
	return { me, ...loaded };
}

async function owner(event: RequestEvent<{ id: string }>) {
	const found = await member(event);
	if (!isOwner(found.group, found.me.id)) error(403, 'グループを作った人だけができます');
	return found;
}

export const actions: Actions = {
	share: async (event) => {
		const { me, group } = await member(event);
		const share = (await event.request.formData()).get('share') === 'on';
		await setShare(event.locals.db, group.id, me.id, share);
	},
	leave: async (event) => {
		const { me, group } = await member(event);
		await leaveGroup(event.locals.db, group.id, me.id);
		redirect(303, '/friends');
	},
	report: async (event) => {
		const { me, group } = await member(event);
		const message = await saveReport(event.locals.db, me.id, 'group', group.id, await event.request.formData());
		if (message) return fail(400, { message });
		return { reported: true };
	},
	rename: async (event) => {
		const { group } = await owner(event);
		const name = readGroupName((await event.request.formData()).get('name'));
		if (!name) return fail(400, { message: `グループの名前は1〜${GROUP_NAME_MAX}文字で入れてください` });
		await renameGroup(event.locals.db, group.id, name);
	},
	regenerate: async (event) => {
		const { group } = await owner(event);
		await regenerateInvite(event.locals.db, group.id);
	},
	remove: async (event) => {
		const { me, group } = await owner(event);
		const userId = String((await event.request.formData()).get('id') ?? '');
		if (userId !== me.id) await removeMember(event.locals.db, group.id, userId);
	},
	delete: async (event) => {
		const { group } = await owner(event);
		await deleteGroup(event.locals.db, group.id);
		redirect(303, '/friends');
	}
};
