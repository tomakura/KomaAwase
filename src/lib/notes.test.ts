import { describe, expect, it } from 'vitest';
import { moveId, orderMemos } from './notes';

const memo = (id: string, date: string, sortOrder: number | null = null) => ({
	id,
	date,
	sortOrder
});
const ids = (list: { id: string }[]) => list.map((n) => n.id).join(',');

describe('orderMemos', () => {
	it('puts the later day on top, and of the same day the one added later', () => {
		const list = [memo('a', '2026-10-01'), memo('b', '2026-10-08'), memo('c', '2026-10-01')];
		expect(ids(orderMemos(list))).toBe('b,c,a');
	});

	it('keeps the order set by hand', () => {
		const list = [memo('a', '2026-10-01', 2), memo('b', '2026-10-08', 0), memo('c', '2026-10-01', 1)];
		expect(ids(orderMemos(list))).toBe('b,c,a');
		const other = [memo('a', '2026-10-08', 0), memo('b', '2026-10-01', 1), memo('c', '2026-10-09', 2)];
		expect(ids(orderMemos(other))).toBe('a,b,c');
	});

	it('puts a memo with no place yet on top of the hand-made order', () => {
		const list = [memo('a', '2026-10-08', 0), memo('b', '2026-10-01', 1), memo('c', '2026-09-01')];
		expect(ids(orderMemos(list))).toBe('c,a,b');
	});
});

describe('moveId', () => {
	it('moves one step, and stays at the ends', () => {
		expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
		expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
		expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
		expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
	});
});
