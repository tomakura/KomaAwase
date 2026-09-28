// Japanese names and titles in kana order, without Intl collation: its Japanese data takes
// about 7ms to load in a fresh Worker. Katakana is folded into hiragana and full-width
// letters into plain ones, then strings compare by code point (kana come out in あいうえお
// order; kanji by code point).
function fold(text: string) {
	return text
		.normalize('NFKC')
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.toLowerCase();
}

export function compareJa(a: string, b: string) {
	const x = fold(a);
	const y = fold(b);
	return x < y ? -1 : x > y ? 1 : 0;
}
