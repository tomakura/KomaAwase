import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import { groupBans, groupMembers, groupRequests, groups, universities, users } from './db/schema';
import { choiceOf, columnsOf, type ShareChoice } from '$lib/sharing';
import { person, randomCode } from './friends';
import { verifiedColumn } from './verify';

export const GROUP_NAME_MAX = 30;
export const GROUP_MEMBERS_MAX = 100;

export function readGroupName(input: FormDataEntryValue | null) {
	const name = String(input ?? '').trim();
	return name && [...name].length <= GROUP_NAME_MAX ? name : null;
}

// How many groups one person may have made and still own, and make in a day
export const GROUPS_OWNED_MAX = 30;
export const GROUPS_A_DAY = 5;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Makes a group with its maker in it, or says which limit it is over. The limits are checked
 * in the statement that saves the group, so two made at once can't pass them together.
 */
export async function createGroup(db: Db, ownerId: string, name: string): Promise<{ id: string } | { limit: 'owned' | 'day' }> {
	const id = crypto.randomUUID();
	const owned = db.select({ n: count() }).from(groups).where(eq(groups.ownerId, ownerId));
	const today = db
		.select({ n: count() })
		.from(groups)
		.where(and(eq(groups.ownerId, ownerId), gte(groups.createdAt, new Date(Date.now() - DAY))));
	const made = await db.run(sql`insert into ${groups} (id, name, owner_id, invite_code)
		select ${id}, ${name}, ${ownerId}, ${randomCode()}
		where (${owned}) < ${GROUPS_OWNED_MAX} and (${today}) < ${GROUPS_A_DAY}`);
	if (made.meta.changes) {
		try {
			await db.insert(groupMembers).values({ groupId: id, userId: ownerId, shareTimetable: true });
		} catch (e) {
			await db.delete(groups).where(eq(groups.id, id));
			throw e;
		}
		return { id };
	}
	const [n] = await owned;
	return { limit: (n?.n ?? 0) >= GROUPS_OWNED_MAX ? 'owned' : 'day' };
}

export function findGroupByInvite(db: Db, code: string) {
	return db.select().from(groups).where(eq(groups.inviteCode, code)).get();
}

// What the invite can be limited to when it is made (A16, A17). 0 is no limit.
export const INVITE_DAYS = [0, 1, 7, 30] as const;
export const INVITE_USES = [0, 1, 5, 10, 30] as const;

/** Why the invite no longer lets anyone in, or null while it does */
export function inviteClosed(
	group: { inviteExpiresAt: Date | null; inviteUsesLeft: number | null },
	now = Date.now()
): 'expired' | 'used' | null {
	if (group.inviteExpiresAt && group.inviteExpiresAt.getTime() <= now) return 'expired';
	if (group.inviteUsesLeft !== null && group.inviteUsesLeft <= 0) return 'used';
	return null;
}

/**
 * Takes one use of the invite, if it still works. Checked and counted in one statement, so two
 * opening it at once can't both take the last use.
 */
export async function useInvite(db: Db, groupId: string, code: string) {
	const used = await db
		.update(groups)
		.set({ inviteUsesLeft: sql`${groups.inviteUsesLeft} - 1` })
		.where(
			and(
				eq(groups.id, groupId),
				eq(groups.inviteCode, code),
				or(isNull(groups.inviteUsesLeft), sql`${groups.inviteUsesLeft} > 0`),
				or(isNull(groups.inviteExpiresAt), sql`${groups.inviteExpiresAt} > ${Date.now()}`)
			)
		)
		.returning({ id: groups.id });
	return used.length > 0;
}

/** Gives back a use taken for someone who then didn't get in (the group was full) */
export async function returnInvite(db: Db, groupId: string, code: string) {
	await db
		.update(groups)
		.set({ inviteUsesLeft: sql`${groups.inviteUsesLeft} + 1` })
		.where(and(eq(groups.id, groupId), eq(groups.inviteCode, code)));
}

export async function memberCount(db: Db, groupId: string) {
	const [row] = await db.select({ n: count() }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
	return row?.n ?? 0;
}

export async function isBanned(db: Db, groupId: string, userId: string) {
	const row = await db
		.select({ userId: groupBans.userId })
		.from(groupBans)
		.where(and(eq(groupBans.groupId, groupId), eq(groupBans.userId, userId)))
		.get();
	return !!row;
}

// Adds a member unless the group is full, counted in the same statement so two joining at
// once can't both take the last place. Whether they were added.
async function addMember(db: Db, groupId: string, userId: string, share: ShareChoice) {
	const { shareTimetable, freeOnly } = columnsOf(share);
	const added = await db.all<{ user_id: string }>(sql`insert into ${groupMembers} (group_id, user_id, share_timetable, free_only)
		select ${groupId}, ${userId}, ${shareTimetable ? 1 : 0}, ${freeOnly ? 1 : 0}
		where (select count(*) from ${groupMembers} where group_id = ${groupId}) < ${GROUP_MEMBERS_MAX}
		on conflict do nothing
		returning user_id`);
	return added.length > 0;
}

/** 'full', or whether they were already in. Joining twice keeps the first choice of sharing. */
export async function joinGroup(db: Db, groupId: string, userId: string, share: ShareChoice) {
	if (await addMember(db, groupId, userId, share)) return 'joined';
	return (await membership(db, groupId, userId)) ? 'member' : 'full';
}

/** Everyone in the group but this person, for telling them someone joined */
export async function otherMembers(db: Db, groupId: string, userId: string) {
	const rows = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.innerJoin(users, and(eq(users.id, groupMembers.userId), isNull(users.suspendedAt)))
		.where(eq(groupMembers.groupId, groupId));
	return rows.map((r) => r.userId).filter((id) => id !== userId);
}

export function membership(db: Db, groupId: string, userId: string) {
	return db
		.select({ shareTimetable: groupMembers.shareTimetable, freeOnly: groupMembers.freeOnly, role: groupMembers.role })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
		.get();
}

export async function setShare(db: Db, groupId: string, userId: string, share: ShareChoice) {
	await db
		.update(groupMembers)
		.set(columnsOf(share))
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
}

/**
 * Leaves the group; the owner passes it to the longest-standing admin, else the longest-standing
 * member, or deletes it if alone.
 */
export async function leaveGroup(db: Db, groupId: string, userId: string) {
	const group = await db.select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.id, groupId)).get();
	if (!group) return;
	const next = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(eq(groupMembers.groupId, groupId))
		.orderBy(desc(sql`${groupMembers.role} = 'admin'`), asc(groupMembers.joinedAt))
		.then((rows) => rows.find((r) => r.userId !== userId));
	const leave = db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
	if (!next) {
		await db.delete(groups).where(eq(groups.id, groupId));
	} else if (group.ownerId === userId || !group.ownerId) {
		await db.batch([
			leave,
			db.update(groups).set({ ownerId: next.userId }).where(eq(groups.id, groupId)),
			db
				.update(groupMembers)
				.set({ role: null })
				.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, next.userId)))
		]);
	} else {
		await leave;
	}
}

const mine = alias(groupMembers, 'mine');

export function listMyGroups(db: Db, userId: string) {
	return db
		.select({
			id: groups.id,
			name: groups.name,
			members: count(groupMembers.userId),
			share: mine.shareTimetable,
			freeOnly: mine.freeOnly,
			// For the owner and admins: people waiting to be let in
			requests: sql<number>`case when ${groups.ownerId} = ${userId} or ${mine.role} = 'admin' then (select count(*) from ${groupRequests} where ${groupRequests.groupId} = ${groups.id}) else 0 end`
		})
		.from(groups)
		.innerJoin(mine, and(eq(mine.groupId, groups.id), eq(mine.userId, userId)))
		.innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
		.innerJoin(users, and(eq(users.id, groupMembers.userId), isNull(users.suspendedAt)))
		.groupBy(groups.id)
		.orderBy(asc(groups.name));
}

/** The group with its members, for someone in it; undefined otherwise. */
export async function loadGroup(db: Db, groupId: string, viewerId: string) {
	const [[group], members] = await db.batch([
		db.select().from(groups).where(eq(groups.id, groupId)),
		db
			.select({
				...person,
				verified: verifiedColumn(),
				shareTimetable: groupMembers.shareTimetable,
				freeOnly: groupMembers.freeOnly,
				role: groupMembers.role,
				joinedAt: groupMembers.joinedAt
			})
			.from(groupMembers)
			.innerJoin(users, eq(users.id, groupMembers.userId))
			.leftJoin(universities, eq(universities.id, users.universityId))
			.where(and(eq(groupMembers.groupId, groupId), isNull(users.suspendedAt)))
			.orderBy(asc(groupMembers.joinedAt))
	]);
	if (!group || !members.some((m) => m.id === viewerId)) return undefined;
	return { group, members };
}

// --- owner and admins ---

export function isOwner(group: { ownerId: string | null }, userId: string) {
	return group.ownerId === userId;
}

/** Whether this member lets people in and makes them leave: the owner, or someone they made admin (A20) */
export function isManager(group: { ownerId: string | null }, member: { id: string; role: 'admin' | null }) {
	return isOwner(group, member.id) || member.role === 'admin';
}

/** The owner and admins, for telling them someone asks to join */
export async function managerIds(db: Db, groupId: string) {
	const rows = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.innerJoin(groups, eq(groups.id, groupMembers.groupId))
		.innerJoin(users, and(eq(users.id, groupMembers.userId), isNull(users.suspendedAt)))
		.where(and(eq(groupMembers.groupId, groupId), or(eq(groupMembers.role, 'admin'), eq(groups.ownerId, groupMembers.userId))));
	return rows.map((r) => r.userId);
}

/** The owner makes a member an admin, or not */
export async function setRole(db: Db, groupId: string, userId: string, admin: boolean) {
	await db
		.update(groupMembers)
		.set({ role: admin ? 'admin' : null })
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
}

/** The owner hands the group to another member and stays on as an admin. Whether they could. */
export async function transferOwner(db: Db, groupId: string, fromId: string, toId: string) {
	if (fromId === toId || !(await membership(db, groupId, toId))) return false;
	const [moved] = await db.batch([
		db
			.update(groups)
			.set({ ownerId: toId })
			.where(and(eq(groups.id, groupId), eq(groups.ownerId, fromId)))
			.returning({ id: groups.id }),
		db
			.update(groupMembers)
			.set({ role: sql`case when ${groupMembers.userId} = ${fromId} then 'admin' else null end` })
			.where(
				and(
					eq(groupMembers.groupId, groupId),
					inArray(groupMembers.userId, [fromId, toId]),
					// Only if the group is still theirs to hand over
					eq(sql`(select owner_id from ${groups} where id = ${groupId})`, toId)
				)
			)
	]);
	return moved.length > 0;
}

export async function renameGroup(db: Db, groupId: string, name: string) {
	await db.update(groups).set({ name }).where(eq(groups.id, groupId));
}

/** A new invite, with the old one no longer working; `days` and `uses` of 0 are no limit */
export async function regenerateInvite(db: Db, groupId: string, days = 0, uses = 0) {
	await db
		.update(groups)
		.set({
			inviteCode: randomCode(),
			inviteExpiresAt: days ? new Date(Date.now() + days * DAY) : null,
			inviteUsesLeft: uses || null
		})
		.where(eq(groups.id, groupId));
}

/** 退出させる: out of the group, and the invite no longer lets them back in */
export async function removeMember(db: Db, groupId: string, userId: string) {
	await db.batch([
		db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))),
		db.delete(groupRequests).where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId))),
		db.insert(groupBans).values({ groupId, userId }).onConflictDoNothing()
	]);
}

/** 参加できるようにする: the invite works for them again */
export async function unban(db: Db, groupId: string, userId: string) {
	await db.delete(groupBans).where(and(eq(groupBans.groupId, groupId), eq(groupBans.userId, userId)));
}

export async function setApproval(db: Db, groupId: string, approval: boolean) {
	await db.update(groups).set({ approval }).where(eq(groups.id, groupId));
}

/** Asks to join a group that needs approval; asking again only updates the choice of sharing */
export async function requestToJoin(db: Db, groupId: string, userId: string, share: ShareChoice) {
	await db
		.insert(groupRequests)
		.values({ groupId, userId, ...columnsOf(share) })
		.onConflictDoUpdate({ target: [groupRequests.groupId, groupRequests.userId], set: columnsOf(share) });
}

export function requestOf(db: Db, groupId: string, userId: string) {
	return db
		.select({ shareTimetable: groupRequests.shareTimetable, freeOnly: groupRequests.freeOnly })
		.from(groupRequests)
		.where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)))
		.get();
}

export async function cancelRequest(db: Db, groupId: string, userId: string) {
	await db.delete(groupRequests).where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)));
}

/** The owner or an admin lets someone in, with the sharing they chose when asking. 'full', 'gone' or 'joined'. */
export async function approveRequest(db: Db, groupId: string, userId: string) {
	const request = await requestOf(db, groupId, userId);
	if (!request) return 'gone';
	if (!(await addMember(db, groupId, userId, choiceOf(request))) && !(await membership(db, groupId, userId))) return 'full';
	await db.delete(groupRequests).where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)));
	return 'joined';
}

/** Who is waiting to join and who was made to leave, for the owner's and admins' screen */
export async function ownerLists(db: Db, groupId: string) {
	const [requests, bans] = await db.batch([
		db
			.select(person)
			.from(groupRequests)
			.innerJoin(users, eq(users.id, groupRequests.userId))
			.leftJoin(universities, eq(universities.id, users.universityId))
			.where(eq(groupRequests.groupId, groupId))
			.orderBy(asc(groupRequests.createdAt)),
		db
			.select(person)
			.from(groupBans)
			.innerJoin(users, eq(users.id, groupBans.userId))
			.leftJoin(universities, eq(universities.id, users.universityId))
			.where(eq(groupBans.groupId, groupId))
			.orderBy(asc(groupBans.createdAt))
	]);
	return { requests, bans };
}

export async function deleteGroup(db: Db, groupId: string) {
	await db.delete(groups).where(eq(groups.id, groupId));
}

/** The user's groups with the members who show them their timetable, for the overlay's chips. */
export async function groupsWithSharers(db: Db, userId: string) {
	const [mineRows, members] = await db.batch([
		listMyGroups(db, userId),
		db
			.select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
			.from(groupMembers)
			.where(
				and(
					inArray(groupMembers.groupId, db.select({ id: mine.groupId }).from(mine).where(eq(mine.userId, userId))),
					eq(groupMembers.shareTimetable, true)
				)
			)
	]);
	return mineRows.map((g) => ({
		id: g.id,
		name: g.name,
		memberIds: members.filter((m) => m.groupId === g.id && m.userId !== userId).map((m) => m.userId)
	}));
}
