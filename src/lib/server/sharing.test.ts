// Sharing with friends and groups: how much each viewer gets, invites with limits, and
// handing a group over
import { describe, expect, it } from 'vitest';
import { busyOnly, BUSY_TITLE } from '$lib/busy';
import { showingClasses, visibleLevels } from './friends';
import { leaveGroup, managerIds, regenerateInvite, returnInvite, transferOwner, useInvite } from './groups';
import { testDatabase } from '../../test/db';

function world(users = 3) {
	const t = testDatabase();
	for (let i = 1; i <= users; i++) t.run(`INSERT INTO users (id, email, nickname) VALUES (?, ?, ?)`, `u${i}`, `u${i}@example.test`, `人${i}`);
	t.run(`INSERT INTO friend_groups (id, name, owner_id, invite_code) VALUES ('g1', 'ゼミ', 'u1', 'CODE')`);
	return t;
}

describe('what each viewer sees', () => {
	it('gives friends what the person chose for friends, and the wider of friend and group', async () => {
		const t = world(3);
		t.run(`INSERT INTO friendships (id, requester_id, addressee_id, pair, status) VALUES ('f1', 'u1', 'u2', 'u1:u2', 'accepted')`);
		t.run(`INSERT INTO friendships (id, requester_id, addressee_id, pair, status) VALUES ('f2', 'u1', 'u3', 'u1:u3', 'accepted')`);
		t.run(`UPDATE users SET friend_share = 'free' WHERE id = 'u2'`);
		t.run(`UPDATE users SET friend_share = 'none' WHERE id = 'u3'`);
		expect(await visibleLevels(t.db, 'u1')).toEqual(new Map([['u2', 'free']]));

		// In a group with u1, u3 shows only when busy and u2 shows everything
		t.run(`INSERT INTO group_members (group_id, user_id) VALUES ('g1', 'u1')`);
		t.run(`INSERT INTO group_members (group_id, user_id, free_only) VALUES ('g1', 'u3', 1)`);
		t.run(`INSERT INTO group_members (group_id, user_id) VALUES ('g1', 'u2')`);
		const levels = await visibleLevels(t.db, 'u1');
		expect(levels).toEqual(new Map([['u2', 'all'], ['u3', 'free']]));
		expect(showingClasses(levels)).toEqual(new Set(['u2']));
	});

	it('leaves out the title, room, color and shared course, and classes with no time', () => {
		const courses = [
			{ id: 'c1', title: '線形代数', color: 'blue', sharedCourseId: 's1', credits: 2, termIds: ['t'], slots: [{ weekday: 1, period: 2, span: 1, room: 'A101' }] },
			{ id: 'c2', title: 'オンデマンド', color: 'red', sharedCourseId: null, credits: 2, termIds: ['t'], slots: [] }
		];
		expect(busyOnly(courses)).toEqual([
			{ id: 'c1', title: BUSY_TITLE, color: 'gray', sharedCourseId: null, credits: null, termIds: ['t'], slots: [{ weekday: 1, period: 2, span: 1, room: null }] }
		]);
	});
});

describe('invites', () => {
	it('lets in only as many as the invite allows, even at once', async () => {
		const t = world();
		await regenerateInvite(t.db, 'g1', 0, 2);
		const [{ code }] = t.rows(`SELECT invite_code AS code FROM friend_groups`) as { code: string }[];
		const used = await Promise.all([1, 2, 3].map(() => useInvite(t.db, 'g1', code)));
		expect(used.filter(Boolean)).toHaveLength(2);
		await returnInvite(t.db, 'g1', code);
		expect(await useInvite(t.db, 'g1', code)).toBe(true);
		expect(await useInvite(t.db, 'g1', 'CODE')).toBe(false);
	});

	it('stops working when it expires, and has no limit by default', async () => {
		const t = world();
		expect(await useInvite(t.db, 'g1', 'CODE')).toBe(true);
		t.run(`UPDATE friend_groups SET invite_expires_at = ?`, Date.now() - 1000);
		expect(await useInvite(t.db, 'g1', 'CODE')).toBe(false);
	});
});

describe('handing over', () => {
	function members(t: ReturnType<typeof world>) {
		t.run(`INSERT INTO group_members (group_id, user_id, created_at) VALUES ('g1', 'u1', 1), ('g1', 'u2', 2), ('g1', 'u3', 3)`);
	}

	it('makes another member the owner and keeps the old one as an admin', async () => {
		const t = world();
		members(t);
		expect(await transferOwner(t.db, 'g1', 'u1', 'u3')).toBe(true);
		expect(t.rows(`SELECT owner_id AS o FROM friend_groups`)).toEqual([{ o: 'u3' }]);
		expect(t.rows(`SELECT user_id AS u, role FROM group_members ORDER BY user_id`)).toEqual([
			{ u: 'u1', role: 'admin' },
			{ u: 'u2', role: null },
			{ u: 'u3', role: null }
		]);
		expect((await managerIds(t.db, 'g1')).sort()).toEqual(['u1', 'u3']);
		// No longer theirs to hand over
		expect(await transferOwner(t.db, 'g1', 'u1', 'u2')).toBe(false);
	});

	it('passes the group to an admin first when the owner leaves', async () => {
		const t = world();
		members(t);
		t.run(`UPDATE group_members SET role = 'admin' WHERE user_id = 'u3'`);
		await leaveGroup(t.db, 'g1', 'u1');
		expect(t.rows(`SELECT owner_id AS o FROM friend_groups`)).toEqual([{ o: 'u3' }]);
		expect(t.rows(`SELECT role FROM group_members WHERE user_id = 'u3'`)).toEqual([{ role: null }]);
	});
});
