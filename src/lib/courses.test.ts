import { describe, expect, it } from 'vitest';
import { absenceLimitOf, classTimeOn, creditsOf, daysLabel, meetsInWeek, periodLabel, readNumber } from './courses';

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

describe('readNumber', () => {
	it('is null for an empty field, and a number in the steps up to the maximum', () => {
		expect(readNumber(null, 20, 0.5)).toBeNull();
		expect(readNumber(' ', 20, 0.5)).toBeNull();
		expect(readNumber('1.5', 20, 0.5)).toBe(1.5);
		expect(readNumber('0', 20, 0.5)).toBe(0);
		expect(readNumber('3', 99, 1)).toBe(3);
	});

	it('is invalid outside them', () => {
		expect(readNumber('1.3', 20, 0.5)).toBe('invalid');
		expect(readNumber('21', 20, 0.5)).toBe('invalid');
		expect(readNumber('-1', 20, 0.5)).toBe('invalid');
		expect(readNumber('0', 99, 1)).toBe('invalid');
		expect(readNumber('abc', 99, 1)).toBe('invalid');
	});
});

describe('credits and absences by the university rule', () => {
	const slot = (span: number) => ({ span });

	it('counts each period as one credit at dhw when none is typed', () => {
		expect(creditsOf({ credits: null, slots: [slot(1)] }, 'dhw')).toBe(1);
		expect(creditsOf({ credits: null, slots: [slot(2)] }, 'dhw')).toBe(2);
		expect(creditsOf({ credits: null, slots: [slot(1), slot(1)] }, 'dhw')).toBe(2);
	});

	it('has no default for a class with no periods, or at another university', () => {
		expect(creditsOf({ credits: null, slots: [] }, 'dhw')).toBeNull();
		expect(creditsOf({ credits: null, slots: [slot(1)] }, 'other')).toBeNull();
		expect(creditsOf({ credits: null, slots: [slot(1)] }, null)).toBeNull();
	});

	it('prefers what was typed', () => {
		expect(creditsOf({ credits: 4, slots: [slot(1)] }, 'dhw')).toBe(4);
		expect(creditsOf({ credits: 2, slots: [] }, 'other')).toBe(2);
	});

	it('allows two absences per credit, or the typed limit', () => {
		expect(absenceLimitOf({ credits: null, absenceLimit: null, slots: [slot(1)] }, 'dhw')).toBe(2);
		expect(absenceLimitOf({ credits: null, absenceLimit: null, slots: [slot(2)] }, 'dhw')).toBe(4);
		expect(absenceLimitOf({ credits: 3, absenceLimit: null, slots: [slot(1)] }, 'dhw')).toBe(6);
		expect(absenceLimitOf({ credits: null, absenceLimit: 5, slots: [slot(1)] }, 'dhw')).toBe(5);
		expect(absenceLimitOf({ credits: null, absenceLimit: null, slots: [slot(1)] }, 'other')).toBeNull();
	});
});

describe('classTimeOn', () => {
	const periods = [
		{ number: 1, start: '08:40', end: '10:10' },
		{ number: 2, start: '10:20', end: '11:50' },
		{ number: 3, start: '12:40', end: '14:10' }
	];

	it('runs from the first period of the slot to the last', () => {
		// 2026-09-30 is a Wednesday (3)
		expect(classTimeOn('2026-09-30', [{ weekday: 3, period: 1, span: 2 }], periods)).toEqual({ start: '08:40', end: '11:50' });
		expect(classTimeOn('2026-09-30', [{ weekday: 3, period: 3, span: 1 }], periods)).toEqual({ start: '12:40', end: '14:10' });
	});

	it('is null on a day the class does not meet, or when the periods are not known', () => {
		expect(classTimeOn('2026-10-01', [{ weekday: 3, period: 1, span: 1 }], periods)).toBeNull();
		expect(classTimeOn('2026-09-30', [{ weekday: 3, period: 5, span: 1 }], periods)).toBeNull();
		expect(classTimeOn('', [{ weekday: 3, period: 1, span: 1 }], periods)).toBeNull();
	});
});
