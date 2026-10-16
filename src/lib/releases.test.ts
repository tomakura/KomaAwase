import { describe, expect, it } from 'vitest';
import { RELEASES } from './releases';

describe('RELEASES', () => {
	it('lists each pull request once, newest first, with something on it', () => {
		for (const r of RELEASES) {
			expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(r.items.length).toBeGreaterThan(0);
		}
		const prs = RELEASES.map((r) => r.pr);
		expect(new Set(prs).size).toBe(prs.length);
		const dates = RELEASES.map((r) => r.date);
		expect(dates).toEqual([...dates].sort().reverse());
	});
});
