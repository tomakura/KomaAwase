import { describe, expect, it } from 'vitest';
import { isIconText, isNickname, splitGraphemes } from './icons';

describe('isIconText', () => {
	it('takes one or two characters you can see', () => {
		for (const text of ['た', 'ゆう', 'AB', '🐺', '👨‍👩‍👧', '🇯🇵', 'が']) expect(isIconText(text)).toBe(true);
	});

	it('refuses empty, long and invisible text', () => {
		for (const text of ['', 'たろう', ' ', 'た ', '　', '​', 'a​', '́', '\u0000', 'a\n']) {
			expect(isIconText(text)).toBe(false);
		}
	});
});

describe('isNickname', () => {
	it('takes names with something to see, spaces inside included', () => {
		for (const text of ['ゆうと', 'Yuto K', 'た'.repeat(20)]) expect(isNickname(text)).toBe(true);
	});

	it('refuses blank, invisible, too long or control characters', () => {
		for (const text of ['', ' ', '​​', 'た'.repeat(21), 'ゆう\u0000と', 'ゆう\nと']) {
			expect(isNickname(text)).toBe(false);
		}
	});
});

describe('splitGraphemes', () => {
	it('splits plain text by character and joined emoji as one', () => {
		expect(splitGraphemes('たろう')).toEqual(['た', 'ろ', 'う']);
		expect(splitGraphemes('👨‍👩‍👧あ')).toEqual(['👨‍👩‍👧', 'あ']);
		expect(splitGraphemes('🇯🇵')).toEqual(['🇯🇵']);
		expect(splitGraphemes('が')).toEqual(['が']);
		expect(splitGraphemes('が')).toEqual(['が']);
	});
});
