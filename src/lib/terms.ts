import { TERMS_MAX, TERM_NAME_MAX, type TermInput } from './presets';
import { isDate } from './time';

// Terms need distinct names, and dates either both set (start before end) or both empty.
export function termsProblem(terms: TermInput[]): string | null {
	if (!terms.length) return '学期を1つ以上入れてください';
	if (terms.length > TERMS_MAX) return `学期は${TERMS_MAX}個までです`;
	const names = new Set<string>();
	for (const t of terms) {
		const len = [...t.name].length;
		if (!len || len > TERM_NAME_MAX) return `学期の名前は1〜${TERM_NAME_MAX}文字で入れてください`;
		if (names.has(t.name)) return `「${t.name}」が2つあります`;
		names.add(t.name);
		if (t.group !== null && [...t.group].length > TERM_NAME_MAX) {
			return `まとまりの名前は${TERM_NAME_MAX}文字までです`;
		}
		if (!!t.start !== !!t.end) return `${t.name}の始まりと終わりの両方を入れてください`;
		if (t.start && t.end) {
			if (!isDate(t.start) || !isDate(t.end)) return `${t.name}の日付を確かめてください`;
			if (t.start > t.end) return `${t.name}は始まりを終わりより前にしてください`;
		}
	}
	return null;
}

type Dated = { start: string | null; end: string | null };

const overlaps = (a: Dated, b: Dated) =>
	!!(a.start && a.end && b.start && b.end && a.start <= b.end && b.start <= a.end);

/**
 * Which of the new terms a removed term's courses move to: those that overlap it in dates,
 * or when dates can't tell, those at the same place in the year (Q1 and Q2 → 前期).
 * Returns indexes into `next`, never empty while `next` isn't.
 */
export function remapTerm(old: Dated & { index: number }, oldCount: number, next: Dated[]): number[] {
	const byDate = next.flatMap((t, j) => (overlaps(old, t) ? [j] : []));
	if (byDate.length) return byDate;
	// Positions as fractions of the year: old covers [i/n, (i+1)/n), new term j covers [j/m, (j+1)/m).
	const m = next.length;
	const from = old.index / oldCount;
	const to = (old.index + 1) / oldCount;
	const byPlace = next.flatMap((_, j) => (j / m < to && from < (j + 1) / m ? [j] : []));
	return byPlace.length ? byPlace : m ? [Math.min(m - 1, Math.floor(from * m))] : [];
}

// Terms sent as JSON by the editor, trimmed. Null when the shape is wrong.
export function parseTerms(json: string): TermInput[] | null {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (!Array.isArray(raw)) return null;
	const out: TermInput[] = [];
	for (const t of raw) {
		if (typeof t !== 'object' || t === null) return null;
		const { id, name, group, start, end } = t as Record<string, unknown>;
		if (typeof name !== 'string') return null;
		const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
		out.push({
			id: typeof id === 'string' ? id : undefined,
			name: name.trim(),
			group: text(group),
			start: text(start),
			end: text(end)
		});
	}
	return out;
}
