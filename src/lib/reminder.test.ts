import { describe, expect, it } from 'vitest';
import { REMINDERS_MAX, REMINDER_MINUTES, leadLabel, reminderMessage, readReminderMinutes } from './reminder';

describe('readReminderMinutes', () => {
	it('keeps the choices that exist, once each, shortest first', () => {
		expect(readReminderMinutes([30, 10, 10])).toEqual([10, 30]);
		expect(readReminderMinutes(['15', 5])).toEqual([5, 15]);
		expect(readReminderMinutes(REMINDER_MINUTES.slice(0, 3))).toEqual([5, 10, 15]);
	});

	it('is null when there are too many, or one that is not offered', () => {
		expect(readReminderMinutes([5, 10, 15, 30])).toBeNull();
		expect(readReminderMinutes([7])).toBeNull();
		expect(readReminderMinutes([0])).toBeNull();
		expect(readReminderMinutes(['x'])).toBeNull();
		expect(readReminderMinutes('10')).toBeNull();
	});

	it('takes none', () => {
		expect(readReminderMinutes([])).toEqual([]);
		expect(REMINDERS_MAX).toBe(3);
	});
});

describe('leadLabel', () => {
	it('says minutes, and hours from an hour on', () => {
		expect(leadLabel(10)).toBe('10分前');
		expect(leadLabel(60)).toBe('1時間前');
		expect(leadLabel(90)).toBe('1時間30分前');
		expect(leadLabel(120)).toBe('2時間前');
	});
});

describe('reminderMessage', () => {
	const base = { lead: 10, period: 3, title: 'サンプル演習 II', start: '12:40', room: 'E10', courseId: 'c1', slotId: 's1', date: '2026-09-29' };

	it('says how long, which period, which class, when and where', () => {
		expect(reminderMessage(base)).toEqual({
			title: '3限 サンプル演習 II が10分後に始まります',
			body: '12:40開始 · E10',
			url: '/courses/c1',
			tag: 'class-s1-2026-09-29-10'
		});
	});

	it('leaves the place out when there is none, and drops the 0 in front of the time', () => {
		expect(reminderMessage({ ...base, room: '', start: '08:40', lead: 90, period: 1 })).toMatchObject({
			title: '1限 サンプル演習 II が1時間30分後に始まります',
			body: '8:40開始'
		});
		expect(reminderMessage({ ...base, room: null }).body).toBe('12:40開始');
	});

	it('gives each class and time its own tag, so a repeat replaces rather than piles up', () => {
		const tags = [base, { ...base, lead: 30 }, { ...base, slotId: 's2' }, { ...base, date: '2026-09-30' }].map((m) => reminderMessage(m).tag);
		expect(new Set(tags).size).toBe(4);
	});
});
