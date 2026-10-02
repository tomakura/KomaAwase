// Laying several people's timetables over the viewer's. Friends at other universities have
// other period times, so classes are placed by clock time, not by period number.
import type { WeekPattern } from './courses';
import { currentTerm } from './terms';
import { toMinutes } from './time';

// The people last laid over, remembered for the next visit
export const OVERLAY_COOKIE = 'overlay_with';

export type OverlayPeriod = { number: number; start: string; end: string };
export type OverlaySlot = { weekday: number; period: number; span: number; room: string | null; week?: WeekPattern };
export type OverlayCourse = { title: string; sharedCourseId: string | null; slots: OverlaySlot[] };
export type OverlayPerson = {
	id: string;
	universityId: string | null;
	periods: OverlayPeriod[];
	courses: OverlayCourse[];
};

export type OverlayGroup = {
	key: string;
	title: string;
	// `week`: odd or even weeks only; shown as a class every week, the overlay being a usual week
	people: { id: string; room: string | null; time: string; week?: WeekPattern }[];
};

export const cellKey = (weekday: number, period: number) => `${weekday}-${period}`;

// 線形代数Ⅱ and 線形代数 Ⅱ are one course; full-width letters fold to half-width.
export function normalizeTitle(title: string) {
	return title.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

// The same shared course is one course; otherwise the same title at the same university.
function groupKey(course: OverlayCourse, universityId: string | null) {
	return course.sharedCourseId
		? `s:${course.sharedCourseId}`
		: `t:${universityId ?? ''}:${normalizeTitle(course.title)}`;
}

const time = (t: string) => t.replace(/^0/, '');

// Equal bands of the colors, side by side (to right) or stacked (to bottom)
const bands = (direction: 'right' | 'bottom', colors: string[]) =>
	`linear-gradient(to ${direction}, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`;

/**
 * The look of a class taken by these people: a band of each person's tint, and a stripe down
 * the left in their colors. A class that is one person's is in just that person's color.
 * `raised` is what the tint is mixed into.
 */
export function classFill(colors: string[], raised = 'var(--raised)') {
	const tints = colors.map((c) => `color-mix(in srgb, ${c} 28%, ${raised})`);
	return `${bands('bottom', colors)} left / 4px 100% no-repeat, ${bands('right', tints)}`;
}

/**
 * Which of the viewer's periods each person is in class during, by the minute. A period
 * counts as taken when any part of it overlaps a class.
 */
export function overlay(viewerPeriods: OverlayPeriod[], days: number[], people: OverlayPerson[]) {
	const cells = new Map<string, OverlayGroup[]>();
	const viewer = viewerPeriods.map((p) => ({ number: p.number, start: toMinutes(p.start), end: toMinutes(p.end) }));

	for (const person of people) {
		for (const course of person.courses) {
			const key = groupKey(course, person.universityId);
			for (const slot of course.slots) {
				const first = person.periods.findIndex((p) => p.number === slot.period);
				if (first < 0) continue;
				const last = person.periods[Math.min(first + Math.max(slot.span, 1) - 1, person.periods.length - 1)];
				const start = toMinutes(person.periods[first].start);
				const end = toMinutes(last.end);
				for (const v of viewer) {
					if (!(v.start < end && start < v.end)) continue;
					const cell = cellKey(slot.weekday, v.number);
					const groups = cells.get(cell) ?? [];
					let group = groups.find((g) => g.key === key);
					if (!group) {
						group = { key, title: course.title, people: [] };
						groups.push(group);
					}
					if (!group.people.some((p) => p.id === person.id)) {
						group.people.push({
							id: person.id,
							room: slot.room,
							time: `${time(person.periods[first].start)}〜${time(last.end)}`,
							...(slot.week && slot.week !== 'every' ? { week: slot.week } : {})
						});
					}
					cells.set(cell, groups);
				}
			}
		}
	}

	const free = days.flatMap((weekday) =>
		viewer.flatMap((v) => (cells.has(cellKey(weekday, v.number)) ? [] : [{ weekday, period: v.number }]))
	);
	return { cells, free };
}

type Term = { id: string; name: string; startDate: string | null; endDate: string | null };

/**
 * A person's term for the day being looked at: by dates when their terms have them,
 * else the term with the same name as the viewer's, else their first. On a day of a break
 * between their terms, `today` says whether that day is now: then they have no classes (none,
 * not the next term's); a term the viewer looks at ahead starts on a day that may fall in their
 * break, and their next term is the one to compare.
 */
export function termOn<T extends Term>(terms: T[], date: string, viewerTermName: string | null, today = false): T | undefined {
	if (terms.some((t) => t.startDate && t.endDate)) {
		return today ? terms.find((t) => t.startDate && t.endDate && t.startDate <= date && date <= t.endDate) : currentTerm(terms, date);
	}
	return terms.find((t) => t.name === viewerTermName) ?? terms[0];
}

// The day the viewer's term is looked at: today while it runs, else its first day.
export function lookingAt(term: { startDate: string | null; endDate: string | null } | undefined, today: string) {
	if (!term?.startDate || !term.endDate) return today;
	return term.startDate <= today && today <= term.endDate ? today : term.startDate;
}
