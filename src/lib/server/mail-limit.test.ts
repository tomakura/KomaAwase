import { describe, expect, it } from 'vitest';
import { mailWindows } from './mail-limit';

describe('mailWindows', () => {
	it('starts a new day at midnight in Japan', () => {
		// 23:59 and 0:00 in Japan are 14:59 and 15:00 UTC
		const before = mailWindows(Date.parse('2026-09-30T14:59:00Z'));
		const after = mailWindows(Date.parse('2026-09-30T15:00:00Z'));
		expect(before.day.key).not.toBe(after.day.key);
		expect(before.day.expiresAt.toISOString()).toBe('2026-09-30T15:00:00.000Z');
		expect(after.day.expiresAt.toISOString()).toBe('2026-10-01T15:00:00.000Z');
	});

	it('counts each hour apart', () => {
		const a = mailWindows(Date.parse('2026-09-30T06:59:59Z'));
		const b = mailWindows(Date.parse('2026-09-30T07:00:00Z'));
		expect(a.hour.key).not.toBe(b.hour.key);
		expect(a.hour.expiresAt.toISOString()).toBe('2026-09-30T07:00:00.000Z');
		expect(a.day.key).toBe(b.day.key);
	});
});
