import { describe, expect, it } from 'vitest';
import { submitLink, weeklyDates } from './tasks';

describe('submitLink', () => {
	it('links https addresses only', () => {
		expect(submitLink('https://lms.example.ac.jp/a?b=1')).toEqual({ href: 'https://lms.example.ac.jp/a?b=1', host: 'lms.example.ac.jp' });
		expect(submitLink('http://example.com')).toBeNull();
		expect(submitLink('javascript:alert(1)')).toBeNull();
		expect(submitLink('3号館のレポートボックス')).toBeNull();
		expect(submitLink(null)).toBeNull();
	});
});

describe('weeklyDates', () => {
	it('repeats every week up to the last day, 20 at most', () => {
		expect(weeklyDates('2026-10-05', '2026-10-20')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
		expect(weeklyDates('2026-10-05', '2027-12-31')).toHaveLength(20);
	});
});
