import { describe, expect, it } from 'vitest';
import { groupPlans, whenLabel, type Plan } from './plans';

const plan = (over: Partial<Plan>): Plan => ({
	kind: 'event',
	id: over.id ?? 'x',
	title: 'あ',
	date: '2026-10-02',
	start: null,
	end: null,
	place: null,
	memo: null,
	courseId: null,
	course: null,
	done: false,
	...over
});

// 2026-09-30 is a Wednesday
const TODAY = '2026-09-30';
const ids = (list: Plan[]) => list.map((p) => p.id);

describe('groupPlans', () => {
	it('splits by day and week', () => {
		const g = groupPlans(
			[
				plan({ id: 'today', date: TODAY }),
				plan({ id: 'tomorrow', date: '2026-10-01' }),
				plan({ id: 'sunday', date: '2026-10-04' }),
				plan({ id: 'monday', date: '2026-10-05' })
			],
			TODAY
		);
		expect(ids(g.today)).toEqual(['today']);
		expect(ids(g.tomorrow)).toEqual(['tomorrow']);
		expect(ids(g.week)).toEqual(['sunday']);
		expect(ids(g.later)).toEqual(['monday']);
	});

	it('shows a homework past due at the top, and folds a past event and a finished task', () => {
		const g = groupPlans(
			[
				plan({ id: 'late', kind: 'task', date: '2026-09-28' }),
				plan({ id: 'old-event', date: '2026-09-28' }),
				plan({ id: 'done', kind: 'task', date: '2026-10-02', done: true }),
				plan({ id: 'no-date', kind: 'task', date: null })
			],
			TODAY
		);
		expect(ids(g.late)).toEqual(['late']);
		expect(ids(g.past).sort()).toEqual(['done', 'old-event']);
		expect(ids(g.open)).toEqual(['no-date']);
	});

	it('puts timed events first on a day, and homework last', () => {
		const g = groupPlans(
			[
				plan({ id: 'task', kind: 'task', date: TODAY }),
				plan({ id: 'allday', date: TODAY }),
				plan({ id: 'late-time', date: TODAY, start: '15:00' }),
				plan({ id: 'early-time', date: TODAY, start: '09:00' })
			],
			TODAY
		);
		expect(ids(g.today)).toEqual(['early-time', 'late-time', 'allday', 'task']);
	});

	it('on a Sunday, tomorrow is already next week', () => {
		const g = groupPlans([plan({ id: 'mon', date: '2026-10-05' })], '2026-10-04');
		expect(ids(g.tomorrow)).toEqual(['mon']);
		expect(g.week).toEqual([]);
	});
});

describe('whenLabel', () => {
	it('writes the day and the time', () => {
		expect(whenLabel({ date: '2026-10-02', start: null, end: null })).toBe('10/2（金） 終日');
		expect(whenLabel({ date: '2026-10-02', start: '14:00', end: '15:30' })).toBe('10/2（金） 14:00〜15:30');
	});
});
