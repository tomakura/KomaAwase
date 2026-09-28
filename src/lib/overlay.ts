// Laying several people's timetables over the viewer's. Friends at other universities have
// other period times, so classes are placed by clock time, not by period number.
import { currentTerm } from './terms';
import { toMinutes } from './time';

// The people last laid over, remembered for the next visit
export const OVERLAY_COOKIE = 'overlay_with';

export type OverlayPeriod = { number: number; start: string; end: string };
export type OverlaySlot = { weekday: number; period: number; span: number; room: string | null };
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
	people: { id: string; room: string | null; time: string }[];
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
						group.people.push({ id: person.id, room: slot.room, time: `${time(person.periods[first].start)}〜${time(last.end)}` });
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
 * else the term with the same name as the viewer's, else their first.
 */
export function termOn<T extends Term>(terms: T[], date: string, viewerTermName: string | null): T | undefined {
	if (terms.some((t) => t.startDate && t.endDate)) return currentTerm(terms, date);
	return terms.find((t) => t.name === viewerTermName) ?? terms[0];
}

// The day the viewer's term is looked at: today while it runs, else its first day.
export function lookingAt(term: { startDate: string | null; endDate: string | null } | undefined, today: string) {
	if (!term?.startDate || !term.endDate) return today;
	return term.startDate <= today && today <= term.endDate ? today : term.startDate;
}
