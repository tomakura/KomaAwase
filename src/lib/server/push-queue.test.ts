import { describe, expect, it } from 'vitest';
import { deliver, sendPart, type PushEnv, type PushItem, type PushPart } from './push-queue';

const item = (n: number, expires = 1_000): PushItem => ({
	deviceId: `d${n}`,
	endpoint: `https://push.example.test/${n}`,
	p256dh: 'k',
	auth: 'a',
	message: { title: 'x' },
	expires
});

// A database that only records what was removed, and a queue that records what was sent
function setup() {
	const removed: unknown[][] = [];
	const queued: { part: PushPart; delay?: number }[] = [];
	const env: PushEnv = {
		DB: {
			prepare: (sql) => ({ bind: (...ids) => ({ all: async () => ({ results: [] }), run: async () => sql.startsWith('DELETE') && removed.push(ids) }) })
		},
		VAPID_PUBLIC_KEY: 'pub',
		VAPID_PRIVATE_KEY: 'priv',
		PUSH_QUEUE: { send: async (part, options) => queued.push({ part, delay: options?.delaySeconds }) }
	};
	return { env, removed, queued };
}

describe('deliver', () => {
	it('sends nothing that is out of date', async () => {
		const { env, queued } = setup();
		const sent: string[] = [];
		const result = await deliver(env, [item(1, 500), item(2, 2_000)], async (s) => (sent.push(s.endpoint), 'sent'), 1_000);
		expect([result, sent, queued.length]).toEqual([{ sent: 1, queued: 0 }, ['https://push.example.test/2'], 0]);
	});

	it('sends 40 now and queues the rest in parts of 40', async () => {
		const { env, queued } = setup();
		const sent: string[] = [];
		const result = await deliver(env, Array.from({ length: 100 }, (_, n) => item(n)), async (s) => (sent.push(s.endpoint), 'sent'));
		expect(result).toEqual({ sent: 40, queued: 60 });
		expect(sent).toHaveLength(40);
		expect(queued.map((q) => q.part.items.length)).toEqual([40, 20]);
		expect(new Set([...sent, ...queued.flatMap((q) => q.part.items.map((i) => i.endpoint))]).size).toBe(100);
	});

	it('queues again only the phones that failed, and removes the ones that are gone', async () => {
		const { env, queued, removed } = setup();
		await deliver(env, [item(1), item(2), item(3)], async (s) => (s.endpoint.endsWith('1') ? 'gone' : s.endpoint.endsWith('2') ? 'failed' : 'sent'));
		expect(removed).toEqual([['d1']]);
		expect(queued).toEqual([{ part: { items: [item(2)], attempt: 2 }, delay: 60 }]);
	});
});

describe('sendPart', () => {
	it('sends what is not out of date', async () => {
		const { env } = setup();
		const sent: string[] = [];
		const n = await sendPart(env, { items: [item(1, 500), item(2, 2_000)], attempt: 1 }, 1_000, async (s) => (sent.push(s.endpoint), 'sent'));
		expect([n, sent]).toEqual([1, ['https://push.example.test/2']]);
	});

	it('tries a failed phone three times in all', async () => {
		const { env, queued } = setup();
		const fail = async () => 'failed' as const;
		await sendPart(env, { items: [item(1)], attempt: 2 }, 0, fail);
		expect(queued.map((q) => q.part.attempt)).toEqual([3]);
		await sendPart(env, { items: [item(1)], attempt: 3 }, 0, fail);
		expect(queued).toHaveLength(1);
	});
});
