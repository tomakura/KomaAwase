import { describe, expect, it } from 'vitest';
import { slotGroups, termSections } from './slot-groups';

const course = (title: string, slots: [number, number, number?][]) => ({
	title,
	slots: slots.map(([weekday, period, span = 1]) => ({ weekday, period, span }))
});

describe('slotGroups', () => {
	it('splits by weekday and period, in order, with no-slot courses last', () => {
		const a = course('A', [[2, 1]]);
		const b = course('B', [[1, 3], [4, 1]]);
		const c = course('C', []);
		const groups = slotGroups([c, a, b]);
		expect(groups.map((g) => g.label)).toEqual(['月曜 3限', '火曜 1限', '木曜 1限', '曜日・時限なし']);
		expect(groups[0].items).toEqual([b]);
		expect(groups[2].items).toEqual([b]);
		expect(groups[3].items).toEqual([c]);
	});

	it('keeps only the slots matching the picked weekday or period', () => {
		const b = course('B', [[1, 3], [4, 1]]);
		expect(slotGroups([b], { weekday: 4 }).map((g) => g.label)).toEqual(['木曜 1限']);
		// A two-period class starting at 2 is found at 3, under its start
		const long = course('L', [[5, 2, 2]]);
		expect(slotGroups([long], { period: 3 }).map((g) => g.label)).toEqual(['金曜 2限']);
	});
});

describe('termSections', () => {
	it('splits by term first, a course with two terms under each and none last', () => {
		const a = { ...course('A', [[1, 1]]), courseTerms: ['Q1'] };
		const b = { ...course('B', [[2, 1]]), courseTerms: ['Q1', 'Q2'] };
		const c = { ...course('C', [[3, 1]]), courseTerms: [] };
		const sections = termSections([a, b, c], ['Q1', 'Q2', 'Q3']);
		expect(sections.map((s) => [s.label, s.groups.flatMap((g) => g.items.map((i) => i.title))])).toEqual([
			['Q1', ['A', 'B']],
			['Q2', ['B']],
			['学期なし', ['C']]
		]);
	});
});
