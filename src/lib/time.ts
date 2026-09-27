// Class times are the university's local time, so "today" and "now" are always Japan time,
// on the server and in the browser alike.
const formatter = new Intl.DateTimeFormat('en-US', {
	timeZone: 'Asia/Tokyo',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type TokyoTime = {
	date: string; // YYYY-MM-DD
	weekday: number; // 1 = Monday ... 7 = Sunday
	minutes: number; // since midnight, with seconds as a fraction
};

export function tokyoTime(ms: number): TokyoTime {
	const parts = Object.fromEntries(formatter.formatToParts(ms).map((p) => [p.type, p.value]));
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday: WEEKDAYS[parts.weekday],
		minutes: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60
	};
}

// Academic years start in April.
export function academicYear(date: string) {
	const [year, month] = date.split('-').map(Number);
	return month >= 4 ? year : year - 1;
}

export function toMinutes(hhmm: string) {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}
