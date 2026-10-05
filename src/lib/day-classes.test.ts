import { describe, expect, it } from 'vitest';
import { classesOn, type DayCourse } from './day-classes';

const terms = [{ id: 't', startDate: '2026-10-01', endDate: '2027-01-31' }];
const periods = [
	{ number: 1, start: '09:00', end: '10:30' },
	{ number: 2, start: '10:40', end: '12:10' },
	{ number: 5, start: '16:20', end: '17:50' }
];
// 2026-10-05 is a Monday
const course = (over: Partial<DayCourse> = {}): DayCourse => ({
	id: 'c',
	title: '線形代数',
	color: 'blue',
	termIds: ['t'],
	slots: [{ weekday: 1, period: 1, span: 2, room: 'A101' }],
	...over
});

describe('classesOn', () => {
	it('lists a class with its times', () => {
		const { items } = classesOn('2026-10-05', { terms, periods, courses: [course()] });
		expect(items).toMatchObject([{ period: 1, start: '09:00', end: '12:10', room: 'A101', status: 'on' }]);
	});

	it('has nothing on a day off, or outside the term', () => {
		const calendar = [{ kind: 'off' as const, label: 'スポーツの日', start: '2026-10-12', end: '2026-10-12' }];
		const day = classesOn('2026-10-12', { terms, periods, courses: [course()], calendar });
		expect(day.off?.label).toBe('スポーツの日');
		expect(day.items).toEqual([]);
		expect(classesOn('2026-09-28', { terms, periods, courses: [course()] }).items).toEqual([]);
	});

	it('marks cancellations and odd weeks', () => {
		expect(classesOn('2026-10-05', { terms, periods, courses: [course({ cancels: ['2026-10-05'] })] }).items[0].status).toBe('cancel');
		const odd = course({ slots: [{ weekday: 1, period: 1, span: 1, week: 'odd', room: null }] });
		expect(classesOn('2026-10-05', { terms, periods, courses: [odd] }).items).toHaveLength(0);
		expect(classesOn('2026-10-12', { terms, periods, courses: [odd] }).items).toHaveLength(1);
	});

	it('shows a moved class once, on the day it moved to', () => {
		const move = { id: 'm', fromDate: '2026-10-05', toDate: '2026-10-07', period: 5, span: 1, room: null };
		const c = course({ moves: [move] });
		expect(classesOn('2026-10-05', { terms, periods, courses: [c] }).items[0].status).toBe('away');
		expect(classesOn('2026-10-07', { terms, periods, courses: [c] }).items).toMatchObject([{ period: 5, start: '16:20', status: 'moved' }]);
	});
});
