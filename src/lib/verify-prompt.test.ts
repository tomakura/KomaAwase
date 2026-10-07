import { describe, expect, it } from 'vitest';
import { daysLeft, verifyHref, verifyPrompt } from './verify-prompt';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2027, 2, 1);
const inDays = (n: number) => ({ expiresAt: now + n * DAY });
const at = (o: { check: { expiresAt: number } | null; shown?: number | null; supported?: boolean }) =>
	verifyPrompt({ supported: true, shown: null, now, ...o });

describe('daysLeft', () => {
	it('counts a part of a day as a day', () => {
		expect(daysLeft(now + 1, now)).toBe(1);
		expect(daysLeft(now + 30 * DAY, now)).toBe(30);
		expect(daysLeft(now, now)).toBe(0);
		expect(daysLeft(now - DAY, now)).toBe(-1);
	});
});

describe('verifyPrompt', () => {
	it('asks someone who never confirmed once', () => {
		expect(at({ check: null })).toEqual({ kind: 'need', stage: 99 });
		expect(at({ check: null, shown: 99 })).toBe(null);
	});

	it('says nothing for a university that cannot be confirmed', () => {
		expect(at({ check: null, supported: false })).toBe(null);
	});

	it('stays quiet until 30 days before', () => {
		expect(at({ check: inDays(31) })).toBe(null);
		expect(at({ check: inDays(30) })).toEqual({ kind: 'expiring', stage: 30, days: 30 });
	});

	it('shows each mark once, from the day it is reached', () => {
		expect(at({ check: inDays(20) })).toEqual({ kind: 'expiring', stage: 30, days: 20 });
		expect(at({ check: inDays(20), shown: 30 })).toBe(null);
		expect(at({ check: inDays(14), shown: 30 })).toEqual({ kind: 'expiring', stage: 14, days: 14 });
		expect(at({ check: inDays(10), shown: 14 })).toBe(null);
		expect(at({ check: inDays(7), shown: 14 })).toEqual({ kind: 'expiring', stage: 7, days: 7 });
		expect(at({ check: inDays(1), shown: 7 })).toBe(null);
	});

	it('shows the latest mark only when several were skipped', () => {
		expect(at({ check: inDays(5), shown: null })).toEqual({ kind: 'expiring', stage: 7, days: 5 });
		expect(at({ check: inDays(5), shown: 30 })).toEqual({ kind: 'expiring', stage: 7, days: 5 });
	});

	it('asks once more after it lapsed', () => {
		expect(at({ check: inDays(-1), shown: 7 })).toEqual({ kind: 'lapsed', stage: 0 });
		expect(at({ check: inDays(-1), shown: 0 })).toBe(null);
		expect(at({ check: inDays(0), shown: null })).toEqual({ kind: 'lapsed', stage: 0 });
	});
});

describe('verifyHref', () => {
	it('comes back to the page with its query', () => {
		expect(verifyHref(new URL('https://koma.invalid/courses/search?q=a b'))).toBe('/more/verify?from=%2Fcourses%2Fsearch%3Fq%3Da%2520b');
		expect(verifyHref('/')).toBe('/more/verify?from=%2F');
	});
});
