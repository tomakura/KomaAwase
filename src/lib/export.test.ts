import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, fitLabel, layout, wrap, type ExportData } from './export';

// One unit per character
const measure = (s: string) => [...s].length;

describe('wrap', () => {
	it('keeps words whole where they fit', () => {
		expect(wrap(measure, ['統計学', '入門'], 5, 3)).toEqual(['統計学入門']);
		expect(wrap(measure, ['統計学', '入門'], 4, 3)).toEqual(['統計学', '入門']);
	});

	it('breaks a word longer than the line anywhere', () => {
		expect(wrap(measure, ['英語', 'コミュニケーション'], 4, 4)).toEqual(['英語', 'コミュニ', 'ケーショ', 'ン']);
	});

	it('never starts a line with ー or a small kana', () => {
		expect(wrap(measure, ['コミュニケーション'], 5, 3)).toEqual(['コミュニ', 'ケーション']);
		expect(wrap(measure, ['プログラミング', '演習'], 6, 3)).toEqual(['プログラミン', 'グ演習']);
		expect(wrap(measure, ['データ', 'ベース'], 4, 3)).toEqual(['データ', 'ベース']);
	});

	it('ends what does not fit with an ellipsis', () => {
		expect(wrap(measure, ['一二三', '四五六', '七八九'], 3, 2)).toEqual(['一二三', '四五…']);
	});
});

const data: ExportData = {
	title: 'はるとの時間割',
	icon: null,
	termLabel: '2026 後期 Q3',
	days: [1, 2, 3, 4, 5],
	periods: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, start: '09:00', end: '10:30' })),
	courses: [],
	unscheduled: []
};

describe('layout', () => {
	it('keeps the period column narrow so slots stay large', () => {
		const tall = layout(data, DEFAULT_OPTIONS);
		expect(tall.labelW).toBeLessThanOrEqual(40);
		expect(tall.cellW).toBeGreaterThan(tall.labelW * 4);
		const withTime = layout(data, { ...DEFAULT_OPTIONS, time: true });
		expect(withTime.labelW).toBeLessThan(withTime.cellW * 0.6);
	});

	it('drops the columns and rows that are turned off', () => {
		const bare = layout(data, { ...DEFAULT_OPTIONS, day: false, period: false, time: false });
		expect(bare.labelW).toBe(0);
		expect(bare.dayH).toBe(0);
		expect(bare.cell(0, 0).x).toBe(bare.grid.x);
	});

	it('fits every slot inside the image', () => {
		for (const format of ['tall', 'wide'] as const) {
			const L = layout(data, { ...DEFAULT_OPTIONS, format, time: true });
			const last = L.cell(4, 5);
			expect(last.x + last.w).toBeLessThanOrEqual(L.width - L.pad + 0.001);
			expect(last.y + last.h).toBeLessThanOrEqual(L.height - L.pad + 0.001);
		}
	});
});

describe('fitLabel', () => {
	it('leaves a label that fits alone', () => {
		expect(fitLabel(measure, 'A-305', 5)).toBe('A-305');
	});

	it('cuts it so the label with … still fits, never inside an emoji', () => {
		expect(fitLabel(measure, '講義棟A-305', 5)).toBe('講義棟A…');
		expect(fitLabel(measure, '🏫体育館アリーナ', 3)).toBe('🏫体…');
	});
});
