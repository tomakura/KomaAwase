// The homework notifications on the day it is due (src/lib/server/task-reminders.ts): in the
// morning, and hours before a due time. The wording lives here so tests and the Worker agree.

export type TaskItem = { id: string; title: string; course: string | null; dueTime: string | null };

/** The minutes after 8:00 the morning notifications are spread over */
export const MORNING_MINUTES = 10;
export const MORNING_START = 8 * 60;

// The kinds that tell some hours before a due time, and how many minutes before
export const LEADS = [
	{ kind: 'taskBefore3h', minutes: 180, label: '3時間' },
	{ kind: 'taskBefore1h', minutes: 60, label: '1時間' }
] as const;

const time = (hhmm: string | null) => (hhmm ? hhmm.replace(/^0/, '') : null);

export function morningMessage(items: TaskItem[], date: string) {
	const tag = `task-morning-${date}`;
	if (items.length === 1) {
		const [i] = items;
		return {
			title: `今日まで：${i.title}`,
			body: [i.course, i.dueTime ? `${time(i.dueTime)}まで` : null].filter(Boolean).join(' · ') || undefined,
			url: '/plans',
			tag
		};
	}
	const names = items.slice(0, 3).map((i) => i.title);
	return {
		title: `今日締め切りの課題が${items.length}件あります`,
		body: `${names.join('、')}${items.length > 3 ? ' ほか' : ''}`,
		url: '/plans',
		tag
	};
}

export function leadMessage(item: TaskItem, label: string, minutes: number) {
	return {
		title: `あと${label}：${item.title}`,
		body: [item.course, item.dueTime ? `${time(item.dueTime)}まで` : null].filter(Boolean).join(' · ') || undefined,
		url: '/plans',
		tag: `task-${item.id}-${minutes}`
	};
}
