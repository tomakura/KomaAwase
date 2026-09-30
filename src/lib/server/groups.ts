import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import { groupBans, groupMembers, groupRequests, groups, universities, users } from './db/schema';
import { person, randomCode } from './friends';
import { verifiedColumn } from './verify';

export const GROUP_NAME_MAX = 30;
export const GROUP_MEMBERS_MAX = 100;

export function readGroupName(input: FormDataEntryValue | null) {
	const name = String(input ?? '').trim();
	return name && [...name].length <= GROUP_NAME_MAX ? name : null;
}

export async function createGroup(db: Db, ownerId: string, name: string) {
	const id = crypto.randomUUID();
	await db.batch([
		db.insert(groups).values({ id, name, ownerId, inviteCode: randomCode() }),
		db.insert(groupMembers).values({ groupId: id, userId: ownerId, shareTimetable: true })
	]);
	return id;
}

export function findGroupByInvite(db: Db, code: string) {
	return db.select().from(groups).where(eq(groups.inviteCode, code)).get();
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

/** 'full', or whether they were already in. Joining twice keeps the first choice of sharing. */
export async function joinGroup(db: Db, groupId: string, userId: string, share: boolean) {
	if ((await memberCount(db, groupId)) >= GROUP_MEMBERS_MAX) return 'full';
	const added = await db
		.insert(groupMembers)
		.values({ groupId, userId, shareTimetable: share })
		.onConflictDoNothing()
		.returning({ userId: groupMembers.userId });
	return added.length ? 'joined' : 'member';
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
		.select({ shareTimetable: groupMembers.shareTimetable })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
		.get();
}

export async function setShare(db: Db, groupId: string, userId: string, share: boolean) {
	await db
		.update(groupMembers)
		.set({ shareTimetable: share })
		.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
}

/** Leaves the group; the owner passes it to the longest-standing member, or deletes it if alone. */
export async function leaveGroup(db: Db, groupId: string, userId: string) {
	const group = await db.select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.id, groupId)).get();
	if (!group) return;
	const next = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(eq(groupMembers.groupId, groupId))
		.orderBy(asc(groupMembers.joinedAt))
		.then((rows) => rows.find((r) => r.userId !== userId));
	const leave = db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
	if (!next) {
		await db.delete(groups).where(eq(groups.id, groupId));
	} else if (group.ownerId === userId || !group.ownerId) {
		await db.batch([leave, db.update(groups).set({ ownerId: next.userId }).where(eq(groups.id, groupId))]);
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
			// For the owner: people waiting to be let in
			requests: sql<number>`case when ${groups.ownerId} = ${userId} then (select count(*) from ${groupRequests} where ${groupRequests.groupId} = ${groups.id}) else 0 end`
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

// --- owner only ---

export function isOwner(group: { ownerId: string | null }, userId: string) {
	return group.ownerId === userId;
}

export async function renameGroup(db: Db, groupId: string, name: string) {
	await db.update(groups).set({ name }).where(eq(groups.id, groupId));
}

export async function regenerateInvite(db: Db, groupId: string) {
	await db.update(groups).set({ inviteCode: randomCode() }).where(eq(groups.id, groupId));
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
export async function requestToJoin(db: Db, groupId: string, userId: string, share: boolean) {
	await db
		.insert(groupRequests)
		.values({ groupId, userId, shareTimetable: share })
		.onConflictDoUpdate({ target: [groupRequests.groupId, groupRequests.userId], set: { shareTimetable: share } });
}

export function requestOf(db: Db, groupId: string, userId: string) {
	return db
		.select({ shareTimetable: groupRequests.shareTimetable })
		.from(groupRequests)
		.where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)))
		.get();
}

export async function cancelRequest(db: Db, groupId: string, userId: string) {
	await db.delete(groupRequests).where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)));
}

/** The owner lets someone in, with the sharing they chose when asking. 'full', 'gone' or 'joined'. */
export async function approveRequest(db: Db, groupId: string, userId: string) {
	const request = await requestOf(db, groupId, userId);
	if (!request) return 'gone';
	if ((await memberCount(db, groupId)) >= GROUP_MEMBERS_MAX) return 'full';
	await db.batch([
		db.insert(groupMembers).values({ groupId, userId, shareTimetable: request.shareTimetable }).onConflictDoNothing(),
		db.delete(groupRequests).where(and(eq(groupRequests.groupId, groupId), eq(groupRequests.userId, userId)))
	]);
	return 'joined';
}

/** Who is waiting to join and who was made to leave, for the owner's screen */
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
