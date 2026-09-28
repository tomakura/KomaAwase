// Starting points for timetables of universities without a preset. The dates are rough;
// people adjust them in 学期の区切り.
import { toMinutes } from './time';

export type TermInput = { id?: string; name: string; group: string | null; start: string | null; end: string | null };
export type PeriodInput = { number: number; start: string; end: string };

export const TERM_SYSTEMS = [
	{ id: 'semester', label: '2学期制' },
	{ id: 'trimester', label: '3学期制' },
	{ id: 'quarter', label: '4学期制' }
] as const;

export type TermSystem = (typeof TERM_SYSTEMS)[number]['id'];

const md = (year: number, monthDay: string, nextYear = false) => `${nextYear ? year + 1 : year}-${monthDay}`;

// Terms for the academic year starting in April of `year`
export function termTemplate(system: TermSystem, year: number): TermInput[] {
	switch (system) {
		case 'semester':
			return [
				{ name: '前期', group: null, start: md(year, '04-01'), end: md(year, '09-19') },
				{ name: '後期', group: null, start: md(year, '09-20'), end: md(year, '03-31', true) }
			];
		case 'trimester':
			return [
				{ name: '春学期', group: null, start: md(year, '04-01'), end: md(year, '08-31') },
				{ name: '秋学期', group: null, start: md(year, '09-01'), end: md(year, '11-30') },
				{ name: '冬学期', group: null, start: md(year, '12-01'), end: md(year, '03-31', true) }
			];
		case 'quarter':
			return [
				{ name: 'Q1', group: '前期', start: md(year, '04-01'), end: md(year, '06-10') },
				{ name: 'Q2', group: '前期', start: md(year, '06-11'), end: md(year, '09-19') },
				{ name: 'Q3', group: '後期', start: md(year, '09-20'), end: md(year, '11-25') },
				{ name: 'Q4', group: '後期', start: md(year, '11-26'), end: md(year, '03-31', true) }
			];
	}
}

// The system a list of terms looks like, for the 2・3・4学期制 buttons
export function termSystemOf(terms: { name: string }[]): TermSystem | null {
	if (terms.length === 2) return 'semester';
	if (terms.length === 3) return 'trimester';
	if (terms.length === 4) return 'quarter';
	return null;
}

export type PeriodPattern = {
	first: number; // 0 or 1
	count: number;
	start: string; // HH:MM of the first period
	length: number; // minutes
	gap: number; // minutes between periods
	lunchAfter: number | null; // period number before the lunch break
	lunch: number; // minutes
};

export const DEFAULT_PERIOD_PATTERN: PeriodPattern = {
	first: 1,
	count: 6,
	start: '09:00',
	length: 90,
	gap: 10,
	lunchAfter: 2,
	lunch: 50
};

export const hhmm = (minutes: number) =>
	`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function generatePeriods(p: PeriodPattern): PeriodInput[] {
	const out: PeriodInput[] = [];
	let at = toMinutes(p.start);
	for (let i = 0; i < p.count; i++) {
		const number = p.first + i;
		out.push({ number, start: hhmm(at), end: hhmm(at + p.length) });
		at += p.length + (number === p.lunchAfter ? p.lunch : p.gap);
	}
	return out;
}

export const DEFAULT_PERIODS = generatePeriods(DEFAULT_PERIOD_PATTERN);

export const PERIODS_MAX = 12;
export const TERMS_MAX = 8;
export const TERM_NAME_MAX = 10;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Periods must be numbered in a row from 0 or 1, each ending before the next starts.
export function periodsProblem(periods: PeriodInput[]): string | null {
	if (!periods.length) return '時限を1つ以上入れてください';
	if (periods.length > PERIODS_MAX) return `時限は${PERIODS_MAX}個までです`;
	const first = periods[0].number;
	if (first !== 0 && first !== 1) return '時限は0限か1限から始めてください';
	for (const [i, p] of periods.entries()) {
		if (p.number !== first + i) return '時限の番号が飛んでいます';
		if (!TIME.test(p.start) || !TIME.test(p.end)) return `${p.number}限の時刻を確かめてください`;
		if (toMinutes(p.start) >= toMinutes(p.end)) return `${p.number}限は始まりを終わりより前にしてください`;
		const prev = periods[i - 1];
		if (prev && toMinutes(prev.end) > toMinutes(p.start)) {
			return `${prev.number}限と${p.number}限の時刻が重なっています`;
		}
	}
	return null;
}

// "6限まで · 1コマ90分" and "1限 9:00〜 / 6限 〜19:30"
export function periodsSummary(periods: PeriodInput[]) {
	if (!periods.length) return { title: '時限なし', detail: '' };
	const first = periods[0];
	const last = periods.at(-1)!;
	const lengths = new Set(periods.map((p) => toMinutes(p.end) - toMinutes(p.start)));
	const time = (t: string) => t.replace(/^0/, '');
	return {
		title: `${last.number}限まで${lengths.size === 1 ? ` · 1コマ${[...lengths][0]}分` : ''}`,
		detail: `${first.number}限 ${time(first.start)}〜 / ${last.number}限 〜${time(last.end)}`
	};
}

// Periods sent as JSON by the editor. Null when the shape is wrong.
export function parsePeriods(json: string): PeriodInput[] | null {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (!Array.isArray(raw)) return null;
	const out: PeriodInput[] = [];
	for (const p of raw) {
		if (typeof p !== 'object' || p === null) return null;
		const { number, start, end } = p as Record<string, unknown>;
		if (!Number.isInteger(number) || typeof start !== 'string' || typeof end !== 'string') return null;
		out.push({ number: number as number, start, end });
	}
	return out;
}

// Days shown in the timetable, sorted and without repeats. Null when not 1〜7.
export function parseDays(json: string): number[] | null {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (!Array.isArray(raw) || !raw.length || !raw.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return null;
	return [...new Set(raw as number[])].sort((a, b) => a - b);
}
