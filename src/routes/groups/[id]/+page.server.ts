import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth/next';
import { users } from '$lib/server/db/schema';
import { visibleUserIds } from '$lib/server/friends';
import {
	GROUP_NAME_MAX,
	INVITE_DAYS,
	INVITE_USES,
	approveRequest,
	cancelRequest,
	deleteGroup,
	inviteClosed,
	isManager,
	isOwner,
	leaveGroup,
	loadGroup,
	otherMembers,
	ownerLists,
	readGroupName,
	regenerateInvite,
	removeMember,
	renameGroup,
	setApproval,
	setRole,
	setShare,
	transferOwner,
	unban
} from '$lib/server/groups';
import { choiceOf, readShareChoice } from '$lib/sharing';
import { notifyLater } from '$lib/server/notify';
import { REPORT_REASONS, saveReport } from '$lib/server/reports';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const me = requireUser(locals, url);
	const [loaded, visible] = await Promise.all([loadGroup(locals.db, params.id, me.id), visibleUserIds(locals.db, me.id)]);
	if (!loaded) error(404, 'グループが見つかりません');
	const { group, members } = loaded;
	const self = members.find((m) => m.id === me.id)!;
	const manager = isManager(group, self);
	return {
		group: { id: group.id, name: group.name, approval: group.approval },
		isOwner: isOwner(group, me.id),
		isManager: manager,
		// Who is waiting to be let in, and who was made to leave: the owner's and admins' to decide
		...(manager ? await ownerLists(locals.db, group.id) : { requests: [], bans: [] }),
		meId: me.id,
		invite: `${url.origin}/join/${group.inviteCode}`,
		inviteExpiresAt: group.inviteExpiresAt?.getTime() ?? null,
		inviteUsesLeft: group.inviteUsesLeft,
		inviteClosed: inviteClosed(group),
		share: choiceOf(self),
		members: members.map(({ joinedAt: _, shareTimetable, freeOnly, ...m }) => ({
			...m,
			share: choiceOf({ shareTimetable, freeOnly }),
			owner: m.id === group.ownerId,
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
	if (!isOwner(found.group, found.me.id)) error(403, 'グループの持ち主だけができます');
	return found;
}

// The owner, or a member they made admin
async function manager(event: RequestEvent<{ id: string }>) {
	const found = await member(event);
	if (!isManager(found.group, found.members.find((m) => m.id === found.me.id)!)) error(403, 'グループの管理者だけができます');
	return found;
}

const pick = <T extends number>(list: readonly T[], input: FormDataEntryValue | null) =>
	list.find((n) => String(n) === input) ?? 0;

export const actions: Actions = {
	share: async (event) => {
		const { me, group } = await member(event);
		const share = readShareChoice((await event.request.formData()).get('share'));
		if (share) await setShare(event.locals.db, group.id, me.id, share);
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
		const { group } = await manager(event);
		const form = await event.request.formData();
		await regenerateInvite(event.locals.db, group.id, pick(INVITE_DAYS, form.get('days')), pick(INVITE_USES, form.get('uses')));
	},
	remove: async (event) => {
		const { me, group, members } = await manager(event);
		const userId = String((await event.request.formData()).get('id') ?? '');
		const target = members.find((m) => m.id === userId);
		// Admins can't make the owner or each other leave
		if (target && (isOwner(group, me.id) || !isManager(group, target))) await removeMember(event.locals.db, group.id, userId);
	},
	admin: async (event) => {
		const { me, group } = await owner(event);
		const form = await event.request.formData();
		const userId = String(form.get('id') ?? '');
		if (userId !== me.id) await setRole(event.locals.db, group.id, userId, form.get('admin') === 'on');
	},
	transfer: async (event) => {
		const { me, group } = await owner(event);
		const userId = String((await event.request.formData()).get('id') ?? '');
		if (!(await transferOwner(event.locals.db, group.id, me.id, userId))) return fail(400, { message: '持ち主を渡せませんでした' });
		notifyLater(event.platform, event.locals.db, [userId], 'groupRequest', {
			title: `「${group.name}」の持ち主になりました`,
			url: `/groups/${group.id}`,
			tag: `group-${group.id}`
		});
	},
	unban: async (event) => {
		const { group } = await manager(event);
		await unban(event.locals.db, group.id, String((await event.request.formData()).get('id') ?? ''));
	},
	approval: async (event) => {
		const { group } = await owner(event);
		await setApproval(event.locals.db, group.id, (await event.request.formData()).get('approval') === 'on');
	},
	approve: async (event) => {
		const { me, group } = await manager(event);
		const userId = String((await event.request.formData()).get('id') ?? '');
		const result = await approveRequest(event.locals.db, group.id, userId);
		if (result === 'full') return fail(400, { message: 'このグループは人数がいっぱいです' });
		if (result === 'joined') {
			const { db } = event.locals;
			notifyLater(event.platform, db, [userId], 'groupApproved', {
				title: `「${group.name}」への参加が承認されました`,
				url: `/groups/${group.id}`,
				tag: `group-${group.id}`
			});
			// The others hear of it as when someone joins; whoever let them in knows
			const joined = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, userId)).get();
			const others = (await otherMembers(db, group.id, userId)).filter((id) => id !== me.id);
			notifyLater(event.platform, db, others, 'groupJoin', {
				title: `${joined?.nickname ?? 'だれか'}さんが「${group.name}」に参加しました`,
				url: `/groups/${group.id}`,
				tag: `group-${group.id}`
			});
		}
	},
	decline: async (event) => {
		const { group } = await manager(event);
		await cancelRequest(event.locals.db, group.id, String((await event.request.formData()).get('id') ?? ''));
	},
	delete: async (event) => {
		const { group } = await owner(event);
		await deleteGroup(event.locals.db, group.id);
		redirect(303, '/friends');
	}
};
