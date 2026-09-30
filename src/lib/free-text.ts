import { DAY_NAMES } from './courses';

/**
 * The free slots as a message to send:
 *   みんな空いてるコマ（2026年度 後期 Q3）
 *   月 2限・4限
 */
export function freeText(term: { year: number; groupName: string | null; name: string } | undefined, byDay: (readonly [number, number[]])[]) {
	const label = term ? `（${[`${term.year}年度`, term.groupName, term.name].filter(Boolean).join(' ')}）` : '';
	return [`みんな空いてるコマ${label}`, ...byDay.map(([day, periods]) => `${DAY_NAMES[day]} ${periods.map((p) => `${p}限`).join('・')}`)].join('\n');
}
