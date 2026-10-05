// Limits that hold when requests come at the same moment: each is checked as the row is saved
import { describe, expect, it } from 'vitest';
import { sendRequest } from './friends';
import { GROUPS_A_DAY, GROUP_MEMBERS_MAX, approveRequest, createGroup, joinGroup } from './groups';
import { createImportJob } from './import/jobs';
import { testDatabase } from '../../test/db';

const IMAGE = 'data:image/jpeg;base64,AAAA';

function world(users = 3) {
	const t = testDatabase();
	for (let i = 1; i <= users; i++) t.run(`INSERT INTO users (id, email, nickname) VALUES (?, ?, ?)`, `u${i}`, `u${i}@example.test`, `人${i}`);
	t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	return t;
}

describe('screenshots', () => {
	it('holds two at a time even when three are sent at once', async () => {
		const t = world();
		const results = await Promise.all([1, 2, 3].map(() => createImportJob(t.db, 'u1', 't1', IMAGE, false, null, 'v1')));
		expect(results.filter((r) => 'id' in r)).toHaveLength(2);
		expect(results.filter((r) => 'message' in r)).toHaveLength(1);
		expect(t.rows(`SELECT consent_version AS v FROM import_jobs`)).toEqual([{ v: 'v1' }, { v: 'v1' }]);
	});
});

describe('groups', () => {
	it('lets in only as many as fit when two take the last place at once', async () => {
		const t = world(3);
		t.run(`INSERT INTO friend_groups (id, name, owner_id, invite_code) VALUES ('g1', 'ゼミ', 'u1', 'code')`);
		t.run(`INSERT INTO group_members (group_id, user_id) VALUES ('g1', 'u1')`);
		for (let i = 0; i < GROUP_MEMBERS_MAX - 2; i++) {
			t.run(`INSERT INTO users (id, email, nickname) VALUES (?, ?, 'x')`, `f${i}`, `f${i}@example.test`);
			t.run(`INSERT INTO group_members (group_id, user_id) VALUES ('g1', ?)`, `f${i}`);
		}
		const results = await Promise.all([joinGroup(t.db, 'g1', 'u2', 'all'), joinGroup(t.db, 'g1', 'u3', 'all')]);
		expect(results.sort()).toEqual(['full', 'joined']);
		expect(t.rows(`SELECT count(*) AS n FROM group_members WHERE group_id = 'g1'`)).toEqual([{ n: GROUP_MEMBERS_MAX }]);
		expect(await joinGroup(t.db, 'g1', results[0] === 'joined' ? 'u2' : 'u3', 'all')).toBe('full');
	});

	it('approves only while there is room, and keeps the request when there is none', async () => {
		const t = world(2);
		t.run(`INSERT INTO friend_groups (id, name, owner_id, invite_code, approval) VALUES ('g1', 'ゼミ', 'u1', 'code', 1)`);
		for (let i = 0; i < GROUP_MEMBERS_MAX; i++) {
			t.run(`INSERT INTO users (id, email, nickname) VALUES (?, ?, 'x')`, `f${i}`, `f${i}@example.test`);
			t.run(`INSERT INTO group_members (group_id, user_id) VALUES ('g1', ?)`, `f${i}`);
		}
		t.run(`INSERT INTO group_requests (group_id, user_id) VALUES ('g1', 'u2')`);
		expect(await approveRequest(t.db, 'g1', 'u2')).toBe('full');
		expect(t.rows(`SELECT count(*) AS n FROM group_requests`)).toEqual([{ n: 1 }]);
		t.run(`DELETE FROM group_members WHERE user_id = 'f0'`);
		expect(await approveRequest(t.db, 'g1', 'u2')).toBe('joined');
		expect(t.rows(`SELECT count(*) AS n FROM group_requests`)).toEqual([{ n: 0 }]);
	});

	it('makes only so many a day, each with its maker in it', async () => {
		const t = world(1);
		const made = await Promise.all(Array.from({ length: GROUPS_A_DAY + 2 }, (_, i) => createGroup(t.db, 'u1', `g${i}`)));
		expect(made.filter((m) => 'id' in m)).toHaveLength(GROUPS_A_DAY);
		expect(made.filter((m) => 'limit' in m && m.limit === 'day')).toHaveLength(2);
		expect(t.rows(`SELECT count(*) AS n FROM group_members WHERE user_id = 'u1'`)).toEqual([{ n: GROUPS_A_DAY }]);
	});
});

describe('friend requests', () => {
	it('keeps to 30 waiting even when sent at once', async () => {
		const t = world(1);
		for (let i = 0; i < 32; i++) t.run(`INSERT INTO users (id, email, nickname) VALUES (?, ?, 'x')`, `f${i}`, `f${i}@example.test`);
		for (let i = 0; i < 29; i++) await sendRequest(t.db, 'u1', `f${i}`);
		const results = await Promise.all([sendRequest(t.db, 'u1', 'f29'), sendRequest(t.db, 'u1', 'f30'), sendRequest(t.db, 'u1', 'f31')]);
		expect(results.sort()).toEqual(['limit', 'limit', 'sent']);
		expect(t.rows(`SELECT count(*) AS n FROM friendships WHERE status = 'pending'`)).toEqual([{ n: 30 }]);
	});

	it('answers a request from the other side instead of asking back', async () => {
		const t = world(2);
		expect(await sendRequest(t.db, 'u1', 'u2')).toBe('sent');
		expect(await sendRequest(t.db, 'u2', 'u1')).toBe('accepted');
	});
});
