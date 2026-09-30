import { describe, expect, it } from 'vitest';
import { fillDays, percent } from './stats';

describe('fillDays', () => {
	it('lists each day up to today and fills the missing ones with 0', () => {
		const out = fillDays([{ date: '2026-09-29', n: 3 }, { date: '2026-09-25', n: 1 }], '2026-09-30', 7);
		expect(out.map((d) => d.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
		expect(out.map((d) => d.n)).toEqual([0, 1, 0, 0, 0, 3, 0]);
	});

	it('drops days outside the range', () => {
		expect(fillDays([{ date: '2026-08-01', n: 9 }], '2026-09-30', 3).map((d) => d.n)).toEqual([0, 0, 0]);
	});
});

describe('percent', () => {
	it('rounds, and is null with nothing to divide', () => {
		expect(percent(1, 3)).toBe(33);
		expect(percent(0, 0)).toBeNull();
	});
});
