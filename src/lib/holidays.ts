// Japan's national holidays, worked out here instead of fetched: the rules as they have been
// since 2020 (the equinoxes by the usual formula, good until 2099). The government fixes the
// equinox days a year ahead, so a far year can be a day off in the rare year the formula misses.
import { addDays, weekdayOf } from './time';

const pad = (n: number) => String(n).padStart(2, '0');
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// The nth Monday of the month
function monday(y: number, m: number, nth: number) {
	const first = day(y, m, 1);
	return addDays(first, ((8 - weekdayOf(first)) % 7) + (nth - 1) * 7);
}

const equinox = (y: number, base: number) => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

/** The holidays of a calendar year, by date, in order */
export function holidaysOf(y: number): { date: string; name: string }[] {
	const fixed: [string, string][] = [
		[day(y, 1, 1), '元日'],
		[monday(y, 1, 2), '成人の日'],
		[day(y, 2, 11), '建国記念の日'],
		[day(y, 2, 23), '天皇誕生日'],
		[day(y, 3, equinox(y, 20.8431)), '春分の日'],
		[day(y, 4, 29), '昭和の日'],
		[day(y, 5, 3), '憲法記念日'],
		[day(y, 5, 4), 'みどりの日'],
		[day(y, 5, 5), 'こどもの日'],
		[monday(y, 7, 3), '海の日'],
		[day(y, 8, 11), '山の日'],
		[monday(y, 9, 3), '敬老の日'],
		[day(y, 9, equinox(y, 23.2488)), '秋分の日'],
		[monday(y, 10, 2), 'スポーツの日'],
		[day(y, 11, 3), '文化の日'],
		[day(y, 11, 23), '勤労感謝の日']
	];
	const names = new Map(fixed);
	// A day between two holidays is one too (国民の休日)
	for (const [date] of fixed) {
		const next = addDays(date, 2);
		if (names.has(next) && !names.has(addDays(date, 1)) && weekdayOf(addDays(date, 1)) !== 7) {
			names.set(addDays(date, 1), '国民の休日');
		}
	}
	// A holiday on a Sunday moves to the next day that isn't one (振替休日)
	for (const [date] of fixed) {
		if (weekdayOf(date) !== 7) continue;
		let d = addDays(date, 1);
		while (names.has(d)) d = addDays(d, 1);
		names.set(d, '振替休日');
	}
	return [...names].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date));
}

/** The holidays of an academic year: April to the next March */
export function holidaysOfYear(year: number) {
	const from = day(year, 4, 1);
	const to = day(year + 1, 3, 31);
	return [...holidaysOf(year), ...holidaysOf(year + 1)].filter((h) => h.date >= from && h.date <= to);
}
