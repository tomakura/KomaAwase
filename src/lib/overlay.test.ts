import { describe, expect, it } from 'vitest';
import { cellKey, lookingAt, normalizeTitle, overlay, termOn, type OverlayPerson } from './overlay';

const dhw = [
	{ number: 1, start: '08:40', end: '10:10' },
	{ number: 2, start: '10:20', end: '11:50' },
	{ number: 3, start: '12:40', end: '14:10' }
];
const other = [
	{ number: 1, start: '09:00', end: '10:30' },
	{ number: 2, start: '10:40', end: '12:10' }
];

const person = (id: string, courses: OverlayPerson['courses'], periods = dhw, universityId = 'dhw'): OverlayPerson => ({
	id,
	universityId,
	periods,
	courses
});
const at = (weekday: number, period: number, span = 1, room: string | null = null) => ({ weekday, period, span, room });

describe('overlay', () => {
	it('puts people taking the same shared course under one title', () => {
		const { cells } = overlay(dhw, [1], [
			person('me', [{ title: '経済学概論', sharedCourseId: 's1', slots: [at(1, 2, 1, 'A-1')] }]),
			person('mio', [{ title: '経済学概論', sharedCourseId: 's1', slots: [at(1, 2, 1, 'A-1')] }])
		]);
		const groups = cells.get(cellKey(1, 2))!;
		expect(groups).toHaveLength(1);
		expect(groups[0].people.map((p) => p.id)).toEqual(['me', 'mio']);
	});

	it('merges unsynced courses by title only within one university', () => {
		const { cells } = overlay(dhw, [1], [
			person('me', [{ title: '線形代数Ⅱ', sharedCourseId: null, slots: [at(1, 1)] }]),
			person('mio', [{ title: '線形代数 Ⅱ', sharedCourseId: null, slots: [at(1, 1)] }]),
			person('yuto', [{ title: '線形代数Ⅱ', sharedCourseId: null, slots: [at(1, 1)] }], dhw, 'other')
		]);
		const groups = cells.get(cellKey(1, 1))!;
		expect(groups.map((g) => g.people.map((p) => p.id))).toEqual([['me', 'mio'], ['yuto']]);
	});

	it('places classes at other universities by clock time', () => {
		// 9:00-10:30 overlaps 1限 (8:40-10:10) and the start of 2限 (10:20-11:50)
		const { cells, free } = overlay(dhw, [3], [person('yuto', [{ title: '簿記論', sharedCourseId: null, slots: [at(3, 1)] }], other, 'other')]);
		expect(cells.has(cellKey(3, 1))).toBe(true);
		expect(cells.has(cellKey(3, 2))).toBe(true);
		expect(cells.has(cellKey(3, 3))).toBe(false);
		expect(free).toEqual([{ weekday: 3, period: 3 }]);
		expect(cells.get(cellKey(3, 1))![0].people[0].time).toBe('9:00〜10:30');
	});

	it('covers every period of a double class', () => {
		const { cells } = overlay(dhw, [2], [person('me', [{ title: 'プログラミング演習', sharedCourseId: null, slots: [at(2, 2, 2)] }])]);
		expect([1, 2, 3].map((p) => cells.has(cellKey(2, p)))).toEqual([false, true, true]);
	});

	it('lists the slots nobody has', () => {
		const { free } = overlay(dhw, [1, 2], [person('me', [{ title: 'A', sharedCourseId: null, slots: [at(1, 1), at(2, 3)] }])]);
		expect(free.map((f) => `${f.weekday}${f.period}`)).toEqual(['12', '13', '21', '22']);
	});
});

describe('termOn', () => {
	const quarters = [
		{ id: 'q1', name: 'Q1', startDate: '2026-04-01', endDate: '2026-06-09' },
		{ id: 'q3', name: 'Q3', startDate: '2026-09-24', endDate: '2026-11-25' }
	];

	it('uses dates, then the next term during a break', () => {
		expect(termOn(quarters, '2026-10-01', null)?.id).toBe('q3');
		expect(termOn(quarters, '2026-09-01', null)?.id).toBe('q3');
	});

	it('falls back to the viewer term name without dates', () => {
		const undated = quarters.map((t) => ({ ...t, startDate: null, endDate: null }));
		expect(termOn(undated, '2026-10-01', 'Q3')?.id).toBe('q3');
		expect(termOn(undated, '2026-10-01', '後期')?.id).toBe('q1');
	});

	it('looks at today during the term, else its first day', () => {
		expect(lookingAt(quarters[1], '2026-10-01')).toBe('2026-10-01');
		expect(lookingAt(quarters[0], '2026-10-01')).toBe('2026-04-01');
		expect(lookingAt({ startDate: null, endDate: null }, '2026-10-01')).toBe('2026-10-01');
	});
});

it('normalizes titles', () => {
	expect(normalizeTitle('ＡＢ 演習')).toBe(normalizeTitle('AB演習'));
});
