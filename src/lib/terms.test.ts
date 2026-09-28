import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIODS, generatePeriods, periodsProblem, periodsSummary, termTemplate } from './presets';
import { remapTerm, termsProblem } from './terms';

describe('generatePeriods', () => {
	it('puts the lunch break after the given period', () => {
		expect(DEFAULT_PERIODS.map((p) => `${p.number} ${p.start}-${p.end}`)).toEqual([
			'1 09:00-10:30',
			'2 10:40-12:10',
			'3 13:00-14:30',
			'4 14:40-16:10',
			'5 16:20-17:50',
			'6 18:00-19:30'
		]);
	});

	it('can start at 0限', () => {
		const periods = generatePeriods({ first: 0, count: 2, start: '07:30', length: 60, gap: 10, lunchAfter: null, lunch: 0 });
		expect(periods).toEqual([
			{ number: 0, start: '07:30', end: '08:30' },
			{ number: 1, start: '08:40', end: '09:40' }
		]);
	});
});

describe('periodsProblem', () => {
	it('accepts the defaults', () => expect(periodsProblem(DEFAULT_PERIODS)).toBeNull());

	it('rejects gaps in numbering, bad times and overlaps', () => {
		expect(periodsProblem([{ number: 2, start: '09:00', end: '10:00' }])).toMatch('0限か1限');
		expect(
			periodsProblem([
				{ number: 1, start: '09:00', end: '10:00' },
				{ number: 3, start: '10:10', end: '11:00' }
			])
		).toMatch('飛んで');
		expect(periodsProblem([{ number: 1, start: '9:00', end: '10:00' }])).toMatch('時刻');
		expect(periodsProblem([{ number: 1, start: '10:00', end: '09:00' }])).toMatch('前に');
		expect(
			periodsProblem([
				{ number: 1, start: '09:00', end: '10:30' },
				{ number: 2, start: '10:00', end: '11:00' }
			])
		).toMatch('重なって');
	});

	it('summarizes', () => {
		expect(periodsSummary(DEFAULT_PERIODS)).toEqual({ title: '6限まで · 1コマ90分', detail: '1限 9:00〜 / 6限 〜19:30' });
	});
});

describe('termsProblem', () => {
	it('accepts the templates', () => {
		for (const system of ['semester', 'trimester', 'quarter'] as const) {
			expect(termsProblem(termTemplate(system, 2026))).toBeNull();
		}
	});

	it('rejects duplicates and half-set or reversed dates', () => {
		const t = (name: string, start: string | null = null, end: string | null = null) => ({ name, group: null, start, end });
		expect(termsProblem([t('前期'), t('前期')])).toMatch('2つ');
		expect(termsProblem([t('前期', '2026-04-01')])).toMatch('両方');
		expect(termsProblem([t('前期', '2026-09-01', '2026-04-01')])).toMatch('前に');
		expect(termsProblem([t('前期', '2026-02-30', '2026-04-01')])).toMatch('日付');
	});
});

describe('remapTerm', () => {
	const quarters = termTemplate('quarter', 2026);
	const semesters = termTemplate('semester', 2026);

	it('follows the dates when both have them', () => {
		// Q2 (6/11-9/19) sits in 前期 (4/1-9/19)
		expect(remapTerm({ ...quarters[1], index: 1 }, 4, semesters)).toEqual([0]);
		// 後期 (9/20-3/31) covers Q3 and Q4
		expect(remapTerm({ ...semesters[1], index: 1 }, 2, quarters)).toEqual([2, 3]);
	});

	it('falls back to the place in the year without dates', () => {
		const undated = (n: number) => Array.from({ length: n }, () => ({ start: null, end: null }));
		expect(remapTerm({ start: null, end: null, index: 1 }, 4, undated(2))).toEqual([0]);
		expect(remapTerm({ start: null, end: null, index: 3 }, 4, undated(2))).toEqual([1]);
		expect(remapTerm({ start: null, end: null, index: 0 }, 2, undated(4))).toEqual([0, 1]);
		expect(remapTerm({ start: null, end: null, index: 1 }, 3, undated(2))).toEqual([0, 1]);
		expect(remapTerm({ start: null, end: null, index: 0 }, 1, undated(1))).toEqual([0]);
	});
});
