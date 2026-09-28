import { describe, expect, it } from 'vitest';
import { daysLabel, meetsInWeek, periodLabel } from './courses';

describe('meetsInWeek', () => {
	// Q3 starts on Thursday 2026-09-24: its first week is Monday 9/21 to Sunday 9/27.
	const start = '2026-09-24';

	it('counts weeks from the one the term starts in', () => {
		expect(meetsInWeek('odd', start, '2026-09-25')).toBe(true); // week 1
		expect(meetsInWeek('odd', start, '2026-09-28')).toBe(false); // week 2, Monday
		expect(meetsInWeek('even', start, '2026-10-04')).toBe(true); // week 2, Sunday
		expect(meetsInWeek('odd', start, '2026-10-05')).toBe(true); // week 3
	});

	it('meets every week without a pattern or a start date, and before the term', () => {
		expect(meetsInWeek('every', start, '2026-09-28')).toBe(true);
		expect(meetsInWeek(undefined, start, '2026-09-28')).toBe(true);
		expect(meetsInWeek('even', null, '2026-09-28')).toBe(true);
		expect(meetsInWeek('even', start, '2026-09-01')).toBe(true);
	});
});

it('labels periods and days', () => {
	expect(periodLabel(3, 2, [1, 2, 3, 4, 5, 6])).toBe('3・4限');
	expect(periodLabel(1, 3, [1, 2, 3, 4, 5, 6])).toBe('1〜3限');
	expect(daysLabel([1, 2, 3, 4, 5])).toBe('月〜金');
	expect(daysLabel([1, 3, 5])).toBe('月・水・金');
	expect(daysLabel([1, 2, 3, 4, 5, 7])).toBe('月〜金・日');
});
