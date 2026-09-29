import { describe, expect, it } from 'vitest';
import { lastQuotaReset, nextRetryTime } from './import-quota';

const jst = (s: string) => new Date(`${s}+09:00`).getTime();

describe('lastQuotaReset', () => {
	it('is 9:00 Japan time (00:00 UTC)', () => {
		expect(lastQuotaReset(jst('2026-10-01T15:00:00')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
		expect(lastQuotaReset(jst('2026-10-01T08:59:00')).toISOString()).toBe('2026-09-30T00:00:00.000Z');
	});
});

describe('nextRetryTime', () => {
	it('is 9:30 the same morning when a job fails before then', () => {
		expect(nextRetryTime(jst('2026-10-01T03:00:00')).getTime()).toBe(jst('2026-10-01T09:30:00'));
	});

	it('is 9:30 the next morning after that', () => {
		expect(nextRetryTime(jst('2026-10-01T09:30:00')).getTime()).toBe(jst('2026-10-02T09:30:00'));
		expect(nextRetryTime(jst('2026-10-01T22:00:00')).getTime()).toBe(jst('2026-10-02T09:30:00'));
	});
});
