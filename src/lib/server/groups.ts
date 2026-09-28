import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import { groupMembers, groups, universities, users } from './db/schema';
import { person, randomCode } from './friends';

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
	const rows = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
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
		.select({ id: groups.id, name: groups.name, members: count(groupMembers.userId), share: mine.shareTimetable })
		.from(groups)
		.innerJoin(mine, and(eq(mine.groupId, groups.id), eq(mine.userId, userId)))
		.innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
		.groupBy(groups.id)
		.orderBy(asc(groups.name));
}

/** The group with its members, for someone in it; undefined otherwise. */
export async function loadGroup(db: Db, groupId: string, viewerId: string) {
	const group = await db.select().from(groups).where(eq(groups.id, groupId)).get();
	if (!group) return undefined;
	const members = await db
		.select({ ...person, shareTimetable: groupMembers.shareTimetable, joinedAt: groupMembers.joinedAt })
		.from(groupMembers)
		.innerJoin(users, eq(users.id, groupMembers.userId))
		.leftJoin(universities, eq(universities.id, users.universityId))
		.where(eq(groupMembers.groupId, groupId))
		.orderBy(asc(groupMembers.joinedAt));
	if (!members.some((m) => m.id === viewerId)) return undefined;
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

export async function removeMember(db: Db, groupId: string, userId: string) {
	await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
}

export async function deleteGroup(db: Db, groupId: string) {
	await db.delete(groups).where(eq(groups.id, groupId));
}

/** The user's groups with the members who show them their timetable, for the overlay's chips. */
export async function groupsWithSharers(db: Db, userId: string) {
	const mineRows = await listMyGroups(db, userId);
	if (!mineRows.length) return [];
	const members = await db
		.select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
		.from(groupMembers)
		.where(and(inArray(groupMembers.groupId, mineRows.slice(0, 90).map((g) => g.id)), eq(groupMembers.shareTimetable, true)));
	return mineRows.map((g) => ({
		id: g.id,
		name: g.name,
		memberIds: members.filter((m) => m.groupId === g.id && m.userId !== userId).map((m) => m.userId)
	}));
}
