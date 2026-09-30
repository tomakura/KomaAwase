import { addDays, daysBetween, isDate, monthDay, weekdayOf } from './time';

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

/**
 * When the class meets on `date`: from the start of its first period to the end of its last,
 * for the first slot that falls on that weekday. Null if it doesn't meet then.
 */
export function classTimeOn(
	date: string,
	slots: { weekday: number; period: number; span: number }[],
	periods: { number: number; start: string; end: string }[]
): { start: string; end: string } | null {
	if (!isDate(date)) return null;
	const weekday = weekdayOf(date);
	const slot = slots.filter((s) => s.weekday === weekday).toSorted((a, b) => a.period - b.period)[0];
	if (!slot) return null;
	const first = periods.find((p) => p.number === slot.period);
	const last = periods.find((p) => p.number === slot.period + slot.span - 1);
	return first && last ? { start: first.start, end: last.end } : null;
}

export const CREDITS_MAX = 20;

// Universities where a class period is one credit, and a class can be missed twice per credit
const PERIOD_CREDIT_UNIVERSITIES = ['dhw'];
const ABSENCES_PER_CREDIT = 2;

/** The credits typed in, or else what the university's rule gives (未入力のとき) */
export function creditsOf(
	course: { credits: number | null; slots: { span: number }[] },
	universityId: string | null | undefined
): number | null {
	if (course.credits) return course.credits;
	if (!universityId || !PERIOD_CREDIT_UNIVERSITIES.includes(universityId)) return null;
	const periods = course.slots.reduce((n, s) => n + s.span, 0);
	return periods || null;
}

/** The limit typed in, or else two absences for each credit where the university has that rule */
export function absenceLimitOf(
	course: { credits: number | null; absenceLimit: number | null; slots: { span: number }[] },
	universityId: string | null | undefined
): number | null {
	if (course.absenceLimit) return course.absenceLimit;
	if (!universityId || !PERIOD_CREDIT_UNIVERSITIES.includes(universityId)) return null;
	const credits = creditsOf(course, universityId);
	return credits ? Math.max(1, Math.round(credits * ABSENCES_PER_CREDIT)) : null;
}
export const ABSENCE_LIMIT_MAX = 99;

// An empty field is no value; a number in steps of `step` up to `max` is one; anything else is invalid
export function readNumber(value: FormDataEntryValue | null, max: number, step: number): number | null | 'invalid' {
	const text = String(value ?? '').trim();
	if (!text) return null;
	const n = Number(text);
	const ok = Number.isFinite(n) && n >= (step < 1 ? 0 : step) && n <= max && Number.isInteger(n / step);
	return ok ? n : 'invalid';
}
