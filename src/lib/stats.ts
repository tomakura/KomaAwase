// The 数字 page of 運営: counts only, never anything about a person.
import { addDays } from './time';

export type DayCount = { date: string; n: number };

/** Every day of the last `days` days ending at `today`, with 0 where the series has none */
export function fillDays(series: DayCount[], today: string, days: number): DayCount[] {
	const byDate = new Map(series.map((s) => [s.date, s.n]));
	return Array.from({ length: days }, (_, i) => {
		const date = addDays(today, i - (days - 1));
		return { date, n: byDate.get(date) ?? 0 };
	});
}

/** A share as a whole percent, or null when there is nothing to divide */
export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
