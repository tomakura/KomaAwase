import { describe, expect, it } from 'vitest';
import { MINUTE, isApple, isEarly, minutesDue, nextAlarm, nextMinute } from './minute-clock';

const at = (hhmmss: string) => Date.parse(`2026-10-07T${hhmmss}Z`);

describe('minutesDue', () => {
	it('is the minute the alarm went off in', () => {
		expect(minutesDue(at('13:02:00'), at('13:03:00.004'))).toEqual([at('13:03:00')]);
	});

	it('is nothing when that minute was sent already', () => {
		expect(minutesDue(at('13:03:00'), at('13:03:00.500'))).toEqual([]);
		expect(minutesDue(at('13:03:00'), at('13:02:59.999'))).toEqual([]);
	});

	it('takes in the minutes missed, five at most', () => {
		expect(minutesDue(at('13:00:00'), at('13:03:20'))).toEqual([at('13:01:00'), at('13:02:00'), at('13:03:00')]);
		expect(minutesDue(at('12:00:00'), at('13:03:20'))).toHaveLength(5);
		expect(minutesDue(at('12:00:00'), at('13:03:20'))[0]).toBe(at('12:59:00'));
	});

	it('starts with this minute the first time', () => {
		expect(minutesDue(undefined, at('13:03:00.010'))).toEqual([at('13:03:00')]);
	});
});

describe('nextMinute', () => {
	it('is the start of the next minute', () => {
		expect(nextMinute(at('13:03:00'))).toBe(at('13:04:00'));
		expect(nextMinute(at('13:03:59.999'))).toBe(at('13:04:00'));
		expect(nextMinute(at('13:03:00')) - at('13:03:00')).toBe(MINUTE);
	});
});

describe('nextAlarm', () => {
	it('is 15 seconds before the next minute, for the iPhones', () => {
		expect(nextAlarm(at('13:03:00.004'))).toBe(at('13:03:45'));
		expect(nextAlarm(at('13:03:44.999'))).toBe(at('13:03:45'));
	});

	it('is the next minute once those are sent', () => {
		expect(nextAlarm(at('13:03:45'))).toBe(at('13:04:00'));
		expect(nextAlarm(at('13:03:59.999'))).toBe(at('13:04:00'));
	});
});

describe('isEarly', () => {
	it('is the last 15 seconds of a minute', () => {
		expect(isEarly(at('13:03:45.010'))).toBe(true);
		expect(isEarly(at('13:03:00.010'))).toBe(false);
		expect(isEarly(at('13:03:44.999'))).toBe(false);
	});
});

describe('isApple', () => {
	it('is the phones Apple sends to', () => {
		expect(isApple('https://web.push.apple.com/QGx')).toBe(true);
		expect(isApple('https://fcm.googleapis.com/fcm/send/abc')).toBe(false);
		expect(isApple('https://evil.example/web.push.apple.com')).toBe(false);
		expect(isApple('not a url')).toBe(false);
	});
});
