// The admin's list of shared courses, split by weekday and period under headings such as
// 「月曜 1限」. A course meeting more than once is under each of its slots (only those matching
// the weekday or period picked, when one is); one with no slots is in a last group.
import { DAY_NAMES } from './courses';

type Slotted = { slots: { weekday: number; period: number; span: number }[] };

export function slotGroups<T extends Slotted>(items: T[], filter: { weekday?: number; period?: number } = {}) {
	const groups = new Map<string, { key: string; label: string; weekday: number; period: number; items: T[] }>();
	const add = (key: string, label: string, weekday: number, period: number, item: T) => {
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { key, label, weekday, period, items: [] }));
		if (!group.items.includes(item)) group.items.push(item);
	};
	for (const item of items) {
		const slots = item.slots.filter(
			(s) =>
				(!filter.weekday || s.weekday === filter.weekday) &&
				(!filter.period || (s.period <= filter.period && filter.period < s.period + s.span))
		);
		if (!item.slots.length) add('none', '曜日・時限なし', 99, 99, item);
		for (const s of slots) add(`${s.weekday}-${s.period}`, `${DAY_NAMES[s.weekday]}曜 ${s.period}限`, s.weekday, s.period, item);
	}
	return [...groups.values()].sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}

/**
 * The same list split first by term (Q1, Q2…, in the order given), then by weekday and period.
 * A course with several terms is under each; one with none is under 「学期なし」 at the end.
 */
export function termSections<T extends Slotted & { courseTerms: string[] }>(
	items: T[],
	terms: string[],
	filter: { weekday?: number; period?: number } = {}
) {
	const sections = [...terms, ''].map((term) => ({
		key: term || 'none',
		label: term || '学期なし',
		items: items.filter((i) => (term ? i.courseTerms.includes(term) : !i.courseTerms.length))
	}));
	return sections.filter((s) => s.items.length).map((s) => ({ key: s.key, label: s.label, groups: slotGroups(s.items, filter) }));
}
