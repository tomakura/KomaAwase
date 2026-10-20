import { describe, expect, it } from 'vitest';
import { parseCourse, parseSlots, parseTerms, parseTitle } from '../../scripts/syllabus/parse.mjs';

describe('reading the syllabus search', () => {
	it('joins periods of a day that follow one another', () => {
		expect(parseSlots('水5 水6')).toEqual([{ weekday: 3, period: 5, span: 2, week: 'every' }]);
		expect(parseSlots('月2 木2', 'odd')).toEqual([
			{ weekday: 1, period: 2, span: 1, week: 'odd' },
			{ weekday: 4, period: 2, span: 1, week: 'odd' }
		]);
		expect(parseSlots('水曜5限、水曜6限')).toEqual([{ weekday: 3, period: 5, span: 2, week: 'every' }]);
	});

	it('reads quarters and the year', () => {
		expect(parseTerms(['2026年度 3Q(後期)', '2026年度 4Q(後期)'])).toEqual({ year: 2026, terms: ['Q3', 'Q4'] });
		expect(parseTerms(['2026年度 後期'])).toEqual({ year: 2026, terms: ['Q3', 'Q4'] });
	});

	it('leaves notes out of the name and keeps whether it is online', () => {
		expect(parseTitle('10000001 演習A 【ｾｯﾄ履修】 ※旧演習')).toEqual({ code: '10000001', title: '演習A', online: false });
		expect(parseTitle('10000002 演習B 【ｾｯﾄ履修】オンデマンド')).toEqual({ code: '10000002', title: '演習B', online: true });
	});

	it('turns a row and its dialog into a course', () => {
		const { year, course } = parseCourse(
			{ slots: '火3 火4', title: '10000003 演習C', teachers: '先生A／先生B', kind: '隔週偶数', terms: ['2026年度 1Q(前期)'], credits: '2単位' },
			[
				{ label: '授業コード', text: '10000003' },
				{ label: '授業概要', text: '概要の文' },
				{ label: '到達目標', text: '目標の文' },
				{ label: '授業内容', text: '' },
				{ label: '第1回', text: '第1回　はじめに\n説明' },
				{ label: '第2回', text: '作品をつくる' }
			]
		);
		expect(year).toBe(2026);
		expect(course).toEqual({
			code: '10000003',
			title: '演習C',
			terms: ['Q1'],
			teachers: ['先生A', '先生B'],
			slots: [{ weekday: 2, period: 3, span: 2, week: 'even' }],
			delivery: null,
			intensiveFrom: null,
			intensiveTo: null,
			credits: 2,
			online: false,
			outline: '授業概要\n概要の文\n\n到達目標\n目標の文',
			schedule: '第1回　はじめに\n説明\n\n第2回\n作品をつくる'
		});
	});

	it('reads an intensive course with no slots', () => {
		const { course } = parseCourse({ slots: '', title: '10000004 特別講義', teachers: '', kind: '集中授業', terms: ['2026年度 3Q(後期)'], credits: '1単位' });
		expect(course).toMatchObject({ slots: [], delivery: 'intensive', teachers: [], outline: null, schedule: null });
	});
});
