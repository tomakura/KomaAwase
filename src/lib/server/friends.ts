import { and, count, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import { blocks, courses, friendships, groupMembers, timetables, universities, users } from './db/schema';

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
	const [pending] = await db
		.select({ n: count() })
		.from(friendships)
		.where(and(eq(friendships.requesterId, meId), eq(friendships.status, 'pending')));
	if ((pending?.n ?? 0) >= PENDING_MAX) return 'limit';
	await db
		.insert(friendships)
		.values({ requesterId: meId, addresseeId: targetId, pair: pairKey(meId, targetId) })
		.onConflictDoNothing({ target: friendships.pair });
	return 'sent';
}

export async function acceptRequest(db: Db, meId: string, requesterId: string) {
	await db
		.update(friendships)
		.set({ status: 'accepted', acceptedAt: new Date() })
		.where(
			and(
				eq(friendships.pair, pairKey(meId, requesterId)),
				eq(friendships.addresseeId, meId),
				eq(friendships.status, 'pending')
			)
		);
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
			...person
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
		.where(or(eq(friendships.requesterId, meId), eq(friendships.addresseeId, meId)));
	const people = (list: typeof rows) =>
		list
			.map(({ requesterId: _, status: __, createdAt: ___, ...p }) => p)
			.sort((a, b) => (a.nickname ?? '').localeCompare(b.nickname ?? '', 'ja'));
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

/**
 * The people whose timetables `meId` may see, besides their own: accepted friends and
 * members of a shared group who show it there, minus anyone blocked either way.
 */
export async function visibleUserIds(db: Db, meId: string): Promise<Set<string>> {
	const [friendRows, groupRows, blockRows] = await db.batch([
		db
			.select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
			.from(friendships)
			.where(
				and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, meId), eq(friendships.addresseeId, meId)))
			),
		db
			.select({ userId: groupMembers.userId })
			.from(groupMembers)
			.innerJoin(mine, and(eq(mine.groupId, groupMembers.groupId), eq(mine.userId, meId)))
			.where(eq(groupMembers.shareTimetable, true)),
		db
			.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
			.from(blocks)
			.where(or(eq(blocks.blockerId, meId), eq(blocks.blockedId, meId)))
	]);
	const ids = new Set<string>();
	for (const f of friendRows) ids.add(f.requesterId === meId ? f.addresseeId : f.requesterId);
	for (const g of groupRows) ids.add(g.userId);
	for (const b of blockRows) ids.delete(b.blockerId === meId ? b.blockedId : b.blockerId);
	ids.delete(meId);
	return ids;
}

export async function canSeeTimetable(db: Db, viewerId: string, ownerId: string) {
	return viewerId === ownerId || (await visibleUserIds(db, viewerId)).has(ownerId);
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
	const out = new Map<string, string[]>();
	if (!sharedIds.length || !visible.size) return out;
	const rows = await db
		.select({ sharedCourseId: courses.sharedCourseId, userId: timetables.userId })
		.from(courses)
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.where(and(inArray(courses.sharedCourseId, sharedIds.slice(0, 90)), eq(timetables.year, year)));
	for (const r of rows) {
		if (!r.sharedCourseId || !visible.has(r.userId)) continue;
		const list = out.get(r.sharedCourseId) ?? [];
		if (!list.includes(r.userId)) list.push(r.userId);
		out.set(r.sharedCourseId, list);
	}
	return out;
}
