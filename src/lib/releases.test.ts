import { describe, expect, it } from 'vitest';
import { RELEASES } from './releases';

describe('RELEASES', () => {
	it('lists each day once, newest first, with something on it', () => {
		const dates = RELEASES.map((r) => r.date);
		for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(dates).toEqual([...new Set(dates)].sort().reverse());
		for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
	});
});
