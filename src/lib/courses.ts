import { addDays, daysBetween, monthDay, weekdayOf } from './time';

// Ids match the --course-* variables in app.css.
export const COURSE_COLORS = [
	{ id: 'red', label: 'あか' },
	{ id: 'orange', label: 'オレンジ' },
	{ id: 'yellow', label: 'きいろ' },
	{ id: 'lime', label: 'きみどり' },
	{ id: 'green', label: 'みどり' },
	{ id: 'mint', label: 'ミント' },
	{ id: 'blue', label: 'あお' },
	{ id: 'indigo', label: 'あいいろ' },
	{ id: 'purple', label: 'むらさき' },
	{ id: 'gray', label: 'グレー' }
] as const;

export const DAY_NAMES = ['', '月', '火', '水', '木', '金', '土', '日'];

export type Delivery = 'ondemand' | 'intensive';

export function isCourseColor(name: string) {
	return COURSE_COLORS.some((c) => c.id === name);
}

export function courseColor(name: string) {
	return `var(--course-${isCourseColor(name) ? name : 'gray'})`;
}

// 2限, 3・4限, 1〜3限. `periods` are the timetable's period numbers in order.
export function periodLabel(period: number, span: number, periods: number[]) {
	if (span <= 1) return `${period}限`;
	const last = periods[periods.indexOf(period) + span - 1] ?? period + span - 1;
	return `${period}${span === 2 ? '・' : '〜'}${last}限`;
}

// オンデマンド, 集中 2/16〜20, 集中 1/30〜2/3
export function deliveryLabel(delivery: Delivery | null, from: string | null, to: string | null) {
	if (delivery === 'ondemand') return 'オンデマンド';
	if (delivery !== 'intensive') return null;
	if (!from) return '集中';
	if (!to || to === from) return `集中 ${monthDay(from)}`;
	const sameMonth = from.slice(0, 7) === to.slice(0, 7);
	return `集中 ${monthDay(from)}〜${sameMonth ? Number(to.slice(8)) : monthDay(to)}`;
}

// Back to the timetable, on the term the user was looking at
export function timetableHref(termId: string | null) {
	return termId ? `/?term=${encodeURIComponent(termId)}` : '/';
}

export function courseHref(courseId: string, termId: string | null, page: '' | '/edit' = '') {
	return `/courses/${courseId}${page}${termId ? `?term=${encodeURIComponent(termId)}` : ''}`;
}

// A named form action that keeps the term in the URL
export function actionHref(action: string, termId: string | null) {
	return `?/${action}${termId ? `&term=${encodeURIComponent(termId)}` : ''}`;
}

// 月〜金, 月〜土, 月・水・金, 月〜金・日
export function daysLabel(days: number[]) {
	const sorted = [...new Set(days)].sort((a, b) => a - b);
	const runs: number[][] = [];
	for (const d of sorted) {
		const run = runs.at(-1);
		if (run && run.at(-1) === d - 1) run.push(d);
		else runs.push([d]);
	}
	return runs
		.map((r) => (r.length >= 3 ? `${DAY_NAMES[r[0]]}〜${DAY_NAMES[r.at(-1)!]}` : r.map((d) => DAY_NAMES[d]).join('・')))
		.join('・');
}

export type WeekPattern = 'every' | 'odd' | 'even';

export const WEEK_PATTERNS: { id: WeekPattern; label: string }[] = [
	{ id: 'every', label: '毎週' },
	{ id: 'odd', label: '奇数週' },
	{ id: 'even', label: '偶数週' }
];

export function isWeekPattern(value: unknown): value is WeekPattern {
	return value === 'every' || value === 'odd' || value === 'even';
}

export const weekLabel = (week: WeekPattern | undefined) => (week === 'odd' ? '奇数週' : week === 'even' ? '偶数週' : null);

/**
 * Whether a slot meets in the week of `date`. Weeks count from the one the term starts in
 * (Monday to Sunday), that week being the 1st. Without a start date every week counts.
 */
export function meetsInWeek(week: WeekPattern | undefined, termStart: string | null | undefined, date: string) {
	if (!week || week === 'every' || !termStart || date < termStart) return true;
	const monday = (d: string) => addDays(d, 1 - weekdayOf(d));
	const index = Math.floor(daysBetween(monday(termStart), monday(date)) / 7) + 1;
	return (index % 2 === 1) === (week === 'odd');
}
