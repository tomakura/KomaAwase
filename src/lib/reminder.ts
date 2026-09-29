// Notifications sent a while before a class starts. A person picks up to three of these
// times; the Worker sends them from a cron every minute (src/lib/server/reminders.ts).
export const REMINDER_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120] as const;
export const REMINDERS_MAX = 3;
// What the notification screen turns on
export const REMINDER_DEFAULT = 10;

/** The chosen times as a list of the offered ones, once each, shortest first; null when it isn't that. */
export function readReminderMinutes(value: unknown): number[] | null {
	if (!Array.isArray(value)) return null;
	const minutes = new Set<number>();
	for (const item of value) {
		const n = typeof item === 'string' && /^\d+$/.test(item) ? Number(item) : item;
		if (typeof n !== 'number' || !(REMINDER_MINUTES as readonly number[]).includes(n)) return null;
		minutes.add(n);
	}
	return minutes.size <= REMINDERS_MAX ? [...minutes].sort((a, b) => a - b) : null;
}

// 10分, 1時間, 1時間30分
function length(minutes: number) {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h ? `${h}時間` : ''}${m ? `${m}分` : ''}`;
}

export const leadLabel = (minutes: number) => `${length(minutes)}前`;

export type ClassStart = {
	lead: number;
	period: number;
	title: string;
	start: string; // HH:MM
	room: string | null;
	courseId: string;
	slotId: string;
	date: string; // YYYY-MM-DD
};

/** The notification: how long, which period, which class, when and where */
export function reminderMessage(c: ClassStart) {
	return {
		title: `${c.period}限 ${c.title} が${length(c.lead)}後に始まります`,
		body: `${c.start.replace(/^0/, '')}開始${c.room ? ` · ${c.room}` : ''}`,
		url: `/courses/${c.courseId}`,
		// The same class at the same time replaces itself on the device rather than piling up
		tag: `class-${c.slotId}-${c.date}-${c.lead}`
	};
}
