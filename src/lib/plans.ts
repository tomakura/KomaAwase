// The 予定 tab: homework (from the classes) and events, sorted into what is due when.
import { addDays, daysBetween, monthDay, weekdayOf } from './time';
import { DAY_NAMES } from './courses';

export type Plan = {
	kind: 'task' | 'event';
	id: string;
	title: string;
	date: string | null; // a task may have no due date
	start: string | null; // a task's due time
	end: string | null;
	place: string | null;
	memo: string | null;
	courseId: string | null;
	course: string | null;
	done: boolean;
	// A task's steps done, as 2/3
	steps: string | null;
	exam: boolean;
	scope: string | null;
	bring: string | null;
};

export const SECTIONS = [
	{ id: 'late', label: '期限が過ぎた課題' },
	{ id: 'today', label: '今日' },
	{ id: 'tomorrow', label: '明日' },
	{ id: 'week', label: '今週' },
	{ id: 'later', label: '来週から' },
	{ id: 'open', label: '期限なしの課題' },
	{ id: 'past', label: '過ぎたもの・済んだもの' }
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

// Earlier first; on one day, the ones with a time come before all-day ones, homework last
const order = (a: Plan, b: Plan) =>
	(a.date ?? '9').localeCompare(b.date ?? '9') ||
	(a.start ?? '99').localeCompare(b.start ?? '99') ||
	a.kind.localeCompare(b.kind) ||
	a.title.localeCompare(b.title);

export function groupPlans(plans: Plan[], today: string): Record<SectionId, Plan[]> {
	const groups: Record<SectionId, Plan[]> = { late: [], today: [], tomorrow: [], week: [], later: [], open: [], past: [] };
	// The week ends on Sunday
	const sunday = addDays(today, 7 - weekdayOf(today));
	for (const p of plans) {
		let id: SectionId;
		if (p.done) id = 'past';
		else if (!p.date) id = 'open';
		else if (p.date < today) id = p.kind === 'task' ? 'late' : 'past';
		else if (p.date === today) id = 'today';
		else if (p.date === addDays(today, 1)) id = 'tomorrow';
		else if (p.date <= sunday) id = 'week';
		else id = 'later';
		groups[id].push(p);
	}
	for (const id of Object.keys(groups) as SectionId[]) groups[id].sort(order);
	// What has passed reads newest first
	groups.past.reverse();
	return groups;
}

// 10/2（金）
export const dayLabel = (date: string) => `${monthDay(date)}（${DAY_NAMES[weekdayOf(date)]}）`;

// 10/2（金）14:00〜15:30, or 10/2（金）終日
export function whenLabel(p: Pick<Plan, 'date' | 'start' | 'end'>) {
	if (!p.date) return '';
	const time = p.start ? ` ${p.start}${p.end ? `〜${p.end}` : ''}` : ' 終日';
	return `${dayLabel(p.date)}${time}`;
}

export function dueLabel(date: string, today: string) {
	const days = daysBetween(today, date);
	if (days > 0) return { text: `あと${days}日`, late: false };
	if (days === 0) return { text: '今日まで', late: false };
	return { text: `${-days}日過ぎ`, late: true };
}
