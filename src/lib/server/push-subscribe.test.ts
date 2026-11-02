import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { pushSubscriptions } from './db/schema';
import { testDatabase } from '../../test/db';

// The same upsert as /api/push/subscribe: the browser moving to someone else gets a new id
async function subscribe(t: ReturnType<typeof testDatabase>, userId: string) {
	await t.db
		.insert(pushSubscriptions)
		.values({ userId, endpoint: 'https://push.example.test/1', p256dh: 'k', auth: 'a', sessionId: null })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				id: sql`case when ${pushSubscriptions.userId} = excluded.user_id then ${pushSubscriptions.id} else excluded.id end`,
				userId,
				p256dh: 'k',
				auth: 'a',
				sessionId: null
			}
		});
	return t.rows(`SELECT id, user_id AS userId FROM push_subscriptions`) as { id: string; userId: string }[];
}

describe('subscribing a browser', () => {
	it('keeps its id for the same person and takes a new one for someone else', async () => {
		const t = testDatabase();
		t.run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'a'), ('u2', 'b@example.test', 'b')`);
		const [first] = await subscribe(t, 'u1');
		const [again] = await subscribe(t, 'u1');
		const [moved] = await subscribe(t, 'u2');
		expect(again.id).toBe(first.id);
		expect(moved.userId).toBe('u2');
		expect(moved.id).not.toBe(first.id);
	});
});
