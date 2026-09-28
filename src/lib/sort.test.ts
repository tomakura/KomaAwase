import { describe, expect, it } from 'vitest';
import { compareJa } from './sort';

describe('compareJa', () => {
	it('puts kana in あいうえお order, katakana with hiragana', () => {
		expect(['ゆうと', 'はると', 'アキラ', 'いちか', 'カナ'].sort(compareJa)).toEqual(['アキラ', 'いちか', 'カナ', 'はると', 'ゆうと']);
	});

	it('treats full-width and plain letters alike', () => {
		expect(compareJa('Ｂｅｎ', 'ben')).toBe(0);
		expect(['b', 'A', 'c'].sort(compareJa)).toEqual(['A', 'b', 'c']);
	});
});
