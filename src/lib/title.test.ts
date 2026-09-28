import { describe, expect, it } from 'vitest';
import { titleParts } from './title';

describe('titleParts', () => {
	it('wraps between words, keeping short pieces with their word', () => {
		expect(titleParts('統計学入門')).toEqual(['統計学', '入門']);
		expect(titleParts('写真演習Ⅰ')).toEqual(['写真', '演習Ⅰ']);
		expect(titleParts('ネットワーク構築演習基礎')).toEqual(['ネットワーク', '構築', '演習', '基礎']);
		expect(titleParts('データサイエンス入門')).toEqual(['データ', 'サイエンス', '入門']);
	});

	it('puts katakana the segmenter chopped up back together', () => {
		expect(titleParts('エンジニアリテラシー')).toEqual(['エンジニア', 'リテラシー']);
	});
});
