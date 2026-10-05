// The classes of one day, as the 今日・明日 list on the timetable shows them: the term, odd and
// even weeks, days off, cancellations and classes moved to or from the day all taken in.
import { examOn, offOn, type CalendarDay, type ClassMove } from './calendar';
import { meetsInWeek, type WeekPattern } from './courses';
import { termIsOn } from './terms';
import { weekdayOf } from './time';

type Term = { id: string; startDate: string | null; endDate: string | null };
type Period = { number: number; start: string; end: string };
export type DayCourse = {
	id: string;
	title: string;
	color: string;
	termIds: string[];
	slots: { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null }[];
	cancels?: string[];
	moves?: ClassMove[];
};

export type DayClass = {
	courseId: string;
	title: string;
	color: string;
	period: number;
	span: number;
	room: string | null;
	start: string | null;
	end: string | null;
	// cancel: 休講; away: held on another day (`move`); moved: held here instead of another day
	status: 'on' | 'cancel' | 'away' | 'moved';
	move?: ClassMove;
};

export function classesOn(
	date: string,
	{ terms, periods, courses, calendar }: { terms: Term[]; periods: Period[]; courses: DayCourse[]; calendar?: CalendarDay[] }
) {
	const off = offOn(calendar, date);
	const exam = examOn(calendar, date);
	const weekday = weekdayOf(date);
	const time = new Map(periods.map((p) => [p.number, p]));
	const items: DayClass[] = [];
	const item = (c: DayCourse, period: number, span: number, room: string | null, status: DayClass['status'], move?: ClassMove) => {
		const last = time.get(period + span - 1) ?? time.get(period);
		items.push({
			courseId: c.id,
			title: c.title,
			color: c.color,
			period,
			span,
			room,
			start: time.get(period)?.start ?? null,
			end: last?.end ?? null,
			status,
			move
		});
	};
	for (const c of courses) {
		for (const m of c.moves ?? []) if (m.toDate === date) item(c, m.period, m.span, m.room, 'moved', m);
		if (off) continue;
		const term = terms.find((t) => c.termIds.includes(t.id) && termIsOn(t, date));
		if (!term) continue;
		for (const s of c.slots) {
			if (s.weekday !== weekday || !meetsInWeek(s.week, term.startDate, date)) continue;
			const away = c.moves?.find((m) => m.fromDate === date);
			const status = away ? 'away' : c.cancels?.includes(date) ? 'cancel' : 'on';
			item(c, s.period, s.span, s.room, status, away);
		}
	}
	items.sort((a, b) => a.period - b.period || a.title.localeCompare(b.title));
	return { off, exam, items };
}
