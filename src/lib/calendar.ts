// Days off and exam periods (calendar_entries), and classes held on another day (course_moves).
import { isDate, monthDay } from './time';

export type CalendarDay = { id?: string; kind: 'off' | 'exam'; label: string; start: string; end: string };
export type ClassMove = { id: string; fromDate: string; toDate: string; period: number; span: number; room: string | null };

export const CALENDAR_LABEL_MAX = 30;
// Per timetable: a year's holidays are about twenty
export const CALENDAR_MAX = 300;
export const MOVES_MAX = 100;

export const covers = (e: Pick<CalendarDay, 'start' | 'end'>, date: string) => e.start <= date && date <= e.end;
export const offOn = <T extends CalendarDay>(entries: T[] | undefined, date: string) =>
	entries?.find((e) => e.kind === 'off' && covers(e, date));
export const examOn = <T extends CalendarDay>(entries: T[] | undefined, date: string) =>
	entries?.find((e) => e.kind === 'exam' && covers(e, date));

// 10/12, or 12/24〜1/7
export const spanLabel = (e: Pick<CalendarDay, 'start' | 'end'>) =>
	e.start === e.end ? monthDay(e.start) : `${monthDay(e.start)}〜${monthDay(e.end)}`;

export function parseCalendarEntry(form: FormData): { entry: CalendarDay } | { message: string } {
	const kind = form.get('kind');
	if (kind !== 'off' && kind !== 'exam') return { message: '休みか試験期間かを選んでください' };
	const label = String(form.get('label') ?? '').trim() || (kind === 'off' ? '休み' : '試験期間');
	const start = String(form.get('start') ?? '');
	const end = String(form.get('end') ?? '') || start;
	if ([...label].length > CALENDAR_LABEL_MAX) return { message: `名前は${CALENDAR_LABEL_MAX}文字までです` };
	if (!isDate(start) || !isDate(end)) return { message: '日付を確かめてください' };
	if (end < start) return { message: '終わりの日は、はじまりの日より後にしてください' };
	return { entry: { kind, label, start, end } };
}
