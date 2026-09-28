import { describe, expect, it } from 'vitest';
import { tokyoTime } from './time';

// What the Intl formatter this replaced said, for the same instants
function viaIntl(ms: number) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'Asia/Tokyo',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			weekday: 'short',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(ms)
			.map((p) => [p.type, p.value])
	);
	const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday as string];
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday,
		minutes: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60
	};
}

describe('tokyoTime', () => {
	it('matches Japan time across midnights, month and year ends', () => {
		for (const iso of [
			'2026-09-28T14:59:59.999Z', // 23:59:59 in Tokyo
			'2026-09-28T15:00:00Z', // midnight
			'2026-12-31T15:00:00Z', // new year
			'2027-02-28T15:30:30Z',
			'2028-02-28T15:00:00Z', // leap day
			'2026-04-01T00:10:20.5Z',
			'1999-12-31T23:59:00Z'
		]) {
			const ms = Date.parse(iso);
			expect(tokyoTime(ms)).toEqual(viaIntl(ms));
		}
	});
});
