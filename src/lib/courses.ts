import { monthDay } from './time';

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
