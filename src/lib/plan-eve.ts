// The notification sent at 20:00 the evening before: what is due or happens tomorrow
// (src/lib/server/plan-eve.ts). The wording lives here so the screen and the Worker agree.

export type EveItem = { kind: 'task' | 'event'; title: string; start: string | null; place: string | null; course: string | null };

/** The minutes after 20:00 the notifications are spread over, so a busy evening stays under the Worker's limits */
export const EVE_MINUTES = 10;

/** Which of the minutes after 20:00 a person's notification goes out in, the same every day */
export function eveSlot(userId: string) {
	let sum = 0;
	for (const c of userId) sum += c.charCodeAt(0);
	return sum % EVE_MINUTES;
}

export function eveMessage(items: EveItem[], date: string) {
	const tag = `plan-eve-${date}`;
	if (items.length === 1) {
		const [i] = items;
		const detail =
			i.kind === 'task' ? i.course : [i.start ? `${i.start.replace(/^0/, '')}から` : '終日', i.place].filter(Boolean).join(' · ');
		return {
			title: i.kind === 'task' ? `明日：${i.title}（締め切り）` : `明日：${i.title}`,
			body: detail ?? undefined,
			url: '/plans',
			tag
		};
	}
	const names = items.slice(0, 3).map((i) => i.title);
	return {
		title: `明日は${items.length}件あります`,
		body: `${names.join('、')}${items.length > 3 ? ' ほか' : ''}`,
		url: '/plans',
		tag
	};
}
