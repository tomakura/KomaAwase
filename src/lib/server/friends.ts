import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { compareJa } from '$lib/sort';
import type { Db } from './db';
import { blocks, courses, friendships, groupMembers, timetables, universities, users } from './db/schema';
import { suspendedIds } from './moderation';
import { verifiedColumn } from './verify';

// No 0/O or 1/I, so a code read aloud or off a screen is typed right. 256 is a multiple
// of 32, so every character is equally likely; 10 characters are 50 bits.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 10;

export function randomCode() {
	return [...crypto.getRandomValues(new Uint8Array(CODE_LENGTH))].map((b) => ALPHABET[b % 32]).join('');
}

// A code typed in, or pasted as a whole link
export function readCode(input: string) {
	const code = input.trim().toUpperCase().split('/').filter(Boolean).at(-1) ?? '';
	return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// People with more pending requests than this can't send more, so nobody can spam.
const PENDING_MAX = 30;

export const person = {
	id: users.id,
	nickname: users.nickname,
	icon: users.icon,
	university: universities.name
};

export async function friendCodeOf(db: Db, user: { id: string; friendCode: string | null }) {
	if (user.friendCode) return user.friendCode;
	return regenerateFriendCode(db, user.id);
}

export async function regenerateFriendCode(db: Db, userId: string) {
	const code = randomCode();
	await db.update(users).set({ friendCode: code }).where(eq(users.id, userId));
	return code;
}

export function findByFriendCode(db: Db, code: string) {
	return db
		.select(person)
		.from(users)
		.leftJoin(universities, eq(universities.id, users.universityId))
		.where(eq(users.friendCode, code))
		.get();
}

export async function isBlocked(db: Db, a: string, b: string) {
	const row = await db
		.select({ id: blocks.blockerId })
		.from(blocks)
		.where(
			or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)))
		)
		.get();
	return !!row;
}

export function friendshipBetween(db: Db, a: string, b: string) {
	return db.select().from(friendships).where(eq(friendships.pair, pairKey(a, b))).get();
}

/**
 * Whether `viewerId` may see `ownerId`'s icon photo: themselves, an accepted friend, or a
 * member of a group they share, unless either blocked the other. Others (someone with a
 * pending request, or opening a friend link) see the letters.
 */
export async function canSeePhoto(db: Db, viewerId: string, ownerId: string) {
	if (viewerId === ownerId) return true;
	const theirs = alias(groupMembers, 'theirs');
	const [blocked, friendship, group] = await Promise.all([
		isBlocked(db, viewerId, ownerId),
		friendshipBetween(db, viewerId, ownerId),
		db
			.select({ groupId: groupMembers.groupId })
			.from(groupMembers)
			.innerJoin(theirs, and(eq(theirs.groupId, groupMembers.groupId), eq(theirs.userId, ownerId)))
			.where(eq(groupMembers.userId, viewerId))
			.get()
	]);
	return !blocked && (friendship?.status === 'accepted' || !!group);
}

export type RequestResult = 'sent' | 'accepted' | 'friends' | 'pending' | 'unavailable' | 'limit';

/** Asks `targetId` to be friends; accepts instead if they already asked. */
export async function sendRequest(db: Db, meId: string, targetId: string): Promise<RequestResult> {
	if (meId === targetId || (await isBlocked(db, meId, targetId))) return 'unavailable';
	const existing = await friendshipBetween(db, meId, targetId);
	if (existing?.status === 'accepted') return 'friends';
	if (existing && existing.requesterId === meId) return 'pending';
	if (existing) {
		await db
			.update(friendships)
			.set({ status: 'accepted', acceptedAt: new Date() })
			.where(eq(friendships.id, existing.id));
		return 'accepted';
	}
	// Counted as it is saved, so requests sent at once can't pass the limit together
	const pending = db
		.select({ n: count() })
		.from(friendships)
		.where(and(eq(friendships.requesterId, meId), eq(friendships.status, 'pending')));
	const saved = await db.run(sql`insert into ${friendships} (id, requester_id, addressee_id, pair)
		select ${crypto.randomUUID()}, ${meId}, ${targetId}, ${pairKey(meId, targetId)}
		where (${pending}) < ${PENDING_MAX}
		on conflict (pair) do nothing`);
	if (saved.meta.changes) return 'sent';
	// Not saved: over the limit, or the two asked each other at the same moment (then this answers theirs)
	return (await friendshipBetween(db, meId, targetId)) ? sendRequest(db, meId, targetId) : 'limit';
}

/** True when there was a request from them to accept */
export async function acceptRequest(db: Db, meId: string, requesterId: string) {
	const accepted = await db
		.update(friendships)
		.set({ status: 'accepted', acceptedAt: new Date() })
		.where(
			and(
				eq(friendships.pair, pairKey(meId, requesterId)),
				eq(friendships.addresseeId, meId),
				eq(friendships.status, 'pending')
			)
		)
		.returning({ id: friendships.id });
	return accepted.length > 0;
}

// Declines, cancels or ends a friendship, whichever side asked.
export async function removeFriendship(db: Db, meId: string, otherId: string) {
	await db.delete(friendships).where(eq(friendships.pair, pairKey(meId, otherId)));
}

export async function block(db: Db, meId: string, otherId: string) {
	if (meId === otherId) return;
	await db.batch([
		db.insert(blocks).values({ blockerId: meId, blockedId: otherId }).onConflictDoNothing(),
		db.delete(friendships).where(eq(friendships.pair, pairKey(meId, otherId)))
	]);
}

export async function unblock(db: Db, meId: string, otherId: string) {
	await db.delete(blocks).where(and(eq(blocks.blockerId, meId), eq(blocks.blockedId, otherId)));
}

export async function listBlocked(db: Db, meId: string) {
	return db
		.select(person)
		.from(blocks)
		.innerJoin(users, eq(users.id, blocks.blockedId))
		.leftJoin(universities, eq(universities.id, users.universityId))
		.where(eq(blocks.blockerId, meId));
}

/** Friends, requests to me and requests from me, each with the other person. */
export async function listFriendships(db: Db, meId: string) {
	const rows = await db
		.select({
			requesterId: friendships.requesterId,
			status: friendships.status,
			createdAt: friendships.createdAt,
			...person,
			verified: verifiedColumn()
		})
		.from(friendships)
		.innerJoin(
			users,
			or(
				and(eq(friendships.requesterId, meId), eq(users.id, friendships.addresseeId)),
				and(eq(friendships.addresseeId, meId), eq(users.id, friendships.requesterId))
			)
		)
		.leftJoin(universities, eq(universities.id, users.universityId))
		// Someone an admin has suspended isn't shown
		.where(and(or(eq(friendships.requesterId, meId), eq(friendships.addresseeId, meId)), isNull(users.suspendedAt)));
	const people = (list: typeof rows) =>
		list
			.map(({ requesterId: _, status: __, createdAt: ___, ...p }) => p)
			.sort((a, b) => compareJa(a.nickname ?? '', b.nickname ?? ''));
	return {
		friends: people(rows.filter((r) => r.status === 'accepted')),
		incoming: people(rows.filter((r) => r.status === 'pending' && r.requesterId !== meId)),
		outgoing: people(rows.filter((r) => r.status === 'pending' && r.requesterId === meId))
	};
}

export async function pendingRequestCount(db: Db, meId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(friendships)
		.where(and(eq(friendships.addresseeId, meId), eq(friendships.status, 'pending')));
	return row?.n ?? 0;
}

const mine = alias(groupMembers, 'mine');

/** How much of someone's timetable a viewer gets: the classes, or only when they are busy */
export type ShareLevel = 'all' | 'free';

/**
 * The people whose timetables `meId` may see, besides their own, with how much: accepted
 * friends who show it to friends, and members of a shared group who show it there, minus
 * anyone blocked either way. Seen both ways, the wider one counts.
 */
export async function visibleLevels(db: Db, meId: string): Promise<Map<string, ShareLevel>> {
	const [friendRows, groupRows, blockRows] = await db.batch([
		db
			.select({ id: users.id, share: users.friendShare })
			.from(friendships)
			.innerJoin(
				users,
				or(
					and(eq(friendships.requesterId, meId), eq(users.id, friendships.addresseeId)),
					and(eq(friendships.addresseeId, meId), eq(users.id, friendships.requesterId))
				)
			)
			.where(
				and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, meId), eq(friendships.addresseeId, meId)))
			),
		db
			.select({ userId: groupMembers.userId, freeOnly: groupMembers.freeOnly })
			.from(groupMembers)
			.innerJoin(mine, and(eq(mine.groupId, groupMembers.groupId), eq(mine.userId, meId)))
			.where(eq(groupMembers.shareTimetable, true)),
		db
			.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
			.from(blocks)
			.where(or(eq(blocks.blockerId, meId), eq(blocks.blockedId, meId)))
	]);
	const levels = new Map<string, ShareLevel>();
	const see = (id: string, level: ShareLevel) => {
		if (levels.get(id) !== 'all') levels.set(id, level);
	};
	for (const f of friendRows) if (f.share !== 'none') see(f.id, f.share);
	for (const g of groupRows) see(g.userId, g.freeOnly ? 'free' : 'all');
	for (const b of blockRows) levels.delete(b.blockerId === meId ? b.blockedId : b.blockerId);
	levels.delete(meId);
	for (const id of await suspendedIds(db, [...levels.keys()])) levels.delete(id);
	return levels;
}

export async function visibleUserIds(db: Db, meId: string): Promise<Set<string>> {
	return new Set((await visibleLevels(db, meId)).keys());
}

/** The people among `levels` who show their classes, not only when they are busy */
export function showingClasses(levels: Map<string, ShareLevel>) {
	return new Set([...levels].flatMap(([id, level]) => (level === 'all' ? [id] : [])));
}

// In chunks, since D1 takes at most 100 bound values per query
export async function loadPeople(db: Db, ids: string[]) {
	const out = [];
	for (let i = 0; i < ids.length; i += 90) {
		out.push(
			...(await db
				.select({ ...person, universityId: users.universityId, daysShown: users.daysShown })
				.from(users)
				.leftJoin(universities, eq(universities.id, users.universityId))
				.where(inArray(users.id, ids.slice(i, i + 90))))
		);
	}
	return out;
}

/** For each shared course, the people among `visible` who have it in their timetable for the year. */
export async function peopleTaking(db: Db, sharedIds: string[], year: number, visible: Set<string>) {
	const out = new Map<string, { id: string; nickname: string | null; icon: typeof users.$inferSelect.icon }[]>();
	if (!sharedIds.length || !visible.size) return out;
	const rows = await db
		.select({ sharedCourseId: courses.sharedCourseId, id: users.id, nickname: users.nickname, icon: users.icon })
		.from(courses)
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.innerJoin(users, eq(users.id, timetables.userId))
		.where(and(inArray(courses.sharedCourseId, sharedIds.slice(0, 90)), eq(timetables.year, year)));
	for (const { sharedCourseId, ...p } of rows) {
		if (!sharedCourseId || !visible.has(p.id)) continue;
		const list = out.get(sharedCourseId) ?? [];
		if (!list.some((q) => q.id === p.id)) list.push(p);
		out.set(sharedCourseId, list);
	}
	return out;
}
