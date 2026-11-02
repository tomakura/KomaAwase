import { describe, expect, it } from 'vitest';
import { dailySweep } from './jobs';
import { testDatabase } from '../../../test/db';

describe('dailySweep', () => {
	it('removes the phones signed up from a session that has gone', async () => {
		const t = testDatabase();
		t.run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'ひと')`);
		const later = Date.now() + 60_000;
		t.run(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('live', 'u1', ?), ('ran-out', 'u1', ?)`, later, Date.now() - 60_000);
		t.run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, session_id) VALUES
			('p1', 'u1', 'https://push.example.test/1', 'k', 'a', 'live'),
			('p2', 'u1', 'https://push.example.test/2', 'k', 'a', 'ran-out'),
			('p3', 'u1', 'https://push.example.test/3', 'k', 'a', 'logged-out'),
			('p4', 'u1', 'https://push.example.test/4', 'k', 'a', NULL)`);
		await dailySweep({} as Env, t.db);
		expect(t.rows(`SELECT id FROM push_subscriptions ORDER BY id`)).toEqual([{ id: 'p1' }, { id: 'p4' }]);
	});
});
