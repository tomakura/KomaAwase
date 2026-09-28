// Where a course title may wrap. Worked out in the browser: setting up the Japanese word
// segmenter loads a dictionary, over 8ms of a Worker's CPU for every fresh isolate.
let words: Intl.Segmenter | undefined;
const OPENING_BRACKET = /[（(「『【［\[〈《〔]$/u;
const KATAKANA = /^[\p{Script=Katakana}ー]+$/u;

// The segmenter chops katakana words it doesn't know into short bits (エンジニア|リ|テラ|シー).
// Bits under three characters in a row are put back together as one word (リテラシー).
function segments(title: string) {
	const out: string[] = [];
	let joining = false;
	words ??= new Intl.Segmenter('ja', { granularity: 'word' });
	for (const { segment } of words.segment(title)) {
		const bit = KATAKANA.test(segment) && [...segment].length < 3;
		if (bit && joining) out[out.length - 1] += segment;
		else out.push(segment);
		joining = bit;
	}
	return out;
}

// Where a course title may wrap: between words, with one-character pieces (学, Ⅱ, A, ）)
// kept on the word before and opening brackets on the word after,
// e.g. 統計学|入門, 線形|代数Ⅱ, 映像|表現論|（前半）. BudouX keeps such compounds whole.
export function titleParts(title: string) {
	const parts: string[] = [];
	for (const segment of segments(title)) {
		const prev = parts.at(-1);
		const joins =
			prev !== undefined &&
			(OPENING_BRACKET.test(prev) || ([...segment].length === 1 && !OPENING_BRACKET.test(segment)));
		if (joins) parts[parts.length - 1] += segment;
		else parts.push(segment);
	}
	return parts;
}
