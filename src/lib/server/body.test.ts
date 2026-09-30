import { describe, expect, it } from 'vitest';
import { readLimited } from './body';

const stream = (...parts: number[][]) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			for (const part of parts) controller.enqueue(new Uint8Array(part));
			controller.close();
		}
	});

describe('readLimited', () => {
	it('joins the chunks of a body within the limit', async () => {
		expect([...(await readLimited(stream([1, 2], [3], [4, 5]), 5))!]).toEqual([1, 2, 3, 4, 5]);
	});

	it('gives nothing back once the body is over the limit', async () => {
		expect(await readLimited(stream([1, 2, 3], [4, 5, 6]), 5)).toBeNull();
	});

	it('stops reading at the limit', async () => {
		let pulled = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new Uint8Array(4));
			}
		});
		expect(await readLimited(body, 10)).toBeNull();
		expect(pulled).toBeLessThan(10);
	});

	it('reads a missing body as empty', async () => {
		expect((await readLimited(null, 5))!.byteLength).toBe(0);
	});
});
