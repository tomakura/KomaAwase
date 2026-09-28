// Class times are the university's local time, so "today" and "now" are always Japan time,
// on the server and in the browser alike. Japan keeps UTC+9 all year (no daylight saving),
// so it is plain arithmetic: an Intl.DateTimeFormat with a time zone took over 10ms to set up
// in a Worker that had just started.
const JST = 9 * 60 * 60 * 1000;

export type TokyoTime = {
	date: string; // YYYY-MM-DD
	weekday: number; // 1 = Monday ... 7 = Sunday
	minutes: number; // since midnight, with seconds as a fraction
};

export function tokyoTime(ms: number): TokyoTime {
	const t = new Date(Math.floor(ms / 1000) * 1000 + JST);
	return {
		date: t.toISOString().slice(0, 10),
		weekday: t.getUTCDay() || 7,
		minutes: t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60
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

// Calendar dates (YYYY-MM-DD) carry no time zone, so they are handled as UTC midnight.
const calendar = (date: string) => new Date(`${date}T00:00:00Z`);

export function isDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const d = calendar(value);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function addDays(date: string, days: number) {
	const d = calendar(date);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
	return Math.round((calendar(to).getTime() - calendar(from).getTime()) / 86_400_000);
}

// 1 = Monday ... 7 = Sunday
export function weekdayOf(date: string) {
	return calendar(date).getUTCDay() || 7;
}

// 10/2
export function monthDay(date: string) {
	return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
