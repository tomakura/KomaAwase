import { describe, expect, it } from 'vitest';
import { holidaysOf, holidaysOfYear } from './holidays';

describe('holidaysOf', () => {
	it('matches the 2026 calendar', () => {
		expect(holidaysOf(2026).map((h) => h.date)).toEqual([
			'2026-01-01',
			'2026-01-12',
			'2026-02-11',
			'2026-02-23',
			'2026-03-20',
			'2026-04-29',
			'2026-05-03',
			'2026-05-04',
			'2026-05-05',
			'2026-05-06', // 憲法記念日 on a Sunday
			'2026-07-20',
			'2026-08-11',
			'2026-09-21',
			'2026-09-22', // between 敬老の日 and 秋分の日
			'2026-09-23',
			'2026-10-12',
			'2026-11-03',
			'2026-11-23'
		]);
	});

	it('moves a Sunday holiday to Monday', () => {
		expect(holidaysOf(2027).find((h) => h.date === '2027-03-22')?.name).toBe('振替休日');
	});
});

describe('holidaysOfYear', () => {
	it('runs from April to March', () => {
		const days = holidaysOfYear(2026).map((h) => h.date);
		expect(days[0]).toBe('2026-04-29');
		expect(days.at(-1)).toBe('2027-03-22');
	});
});
