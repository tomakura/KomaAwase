import { fail, redirect } from '@sveltejs/kit';
import { parseCalendarEntry, type CalendarDay } from '$lib/calendar';
import { holidaysOfYear } from '$lib/holidays';
import { addCalendarEntries, calendarPreset, calendarQuery, deleteCalendarEntry } from '$lib/server/calendar';
import { getOrCreateTimetable } from '$lib/server/timetable';
import { academicYear, tokyoTime } from '$lib/time';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// This year's timetable, whose calendar this page shows
async function timetableOf({ locals }: Pick<RequestEvent, 'locals'>) {
	if (!locals.user) redirect(303, '/login');
	const today = tokyoTime(Date.now()).date;
	return getOrCreateTimetable(locals.db, locals.user, academicYear(today), locals.timetable);
}

const TOO_MANY = '日程が多すぎます。いらないものを消してから入れてください';

export const load: PageServerLoad = async (event) => {
	const timetable = await timetableOf(event);
	const [entries, preset] = await Promise.all([
		calendarQuery(event.locals.db, timetable.id),
		calendarPreset(event.locals.db, timetable.universityId, timetable.year)
	]);
	const has = (e: CalendarDay) => entries.some((x) => x.kind === e.kind && x.start === e.start && x.end === e.end);
	const holidays = holidaysOfYear(timetable.year);
	const back = event.url.searchParams.get('back');
	return {
		back: back?.startsWith('/more') ? back : '/',
		year: timetable.year,
		today: tokyoTime(Date.now()).date,
		entries,
		holidaysMissing: holidays.filter((h) => !has({ kind: 'off', label: h.name, start: h.date, end: h.date })).length,
		preset: preset && { ...preset, missing: preset.entries.filter((e) => !has(e)).length }
	};
};

export const actions: Actions = {
	add: async (event) => {
		const timetable = await timetableOf(event);
		const parsed = parseCalendarEntry(await event.request.formData());
		if ('message' in parsed) return fail(400, { message: parsed.message });
		if ((await addCalendarEntries(event.locals.db, timetable.id, [parsed.entry])) === null) return fail(400, { message: TOO_MANY });
		return { added: true };
	},
	remove: async (event) => {
		const timetable = await timetableOf(event);
		await deleteCalendarEntry(event.locals.db, timetable.id, String((await event.request.formData()).get('id') ?? ''));
	},
	holidays: async (event) => {
		const timetable = await timetableOf(event);
		const entries = holidaysOfYear(timetable.year).map((h) => ({ kind: 'off' as const, label: h.name, start: h.date, end: h.date }));
		if ((await addCalendarEntries(event.locals.db, timetable.id, entries)) === null) return fail(400, { message: TOO_MANY });
	},
	preset: async (event) => {
		const timetable = await timetableOf(event);
		const preset = await calendarPreset(event.locals.db, timetable.universityId, timetable.year);
		if (!preset) return fail(400, { message: '大学の日程が見つかりません' });
		if ((await addCalendarEntries(event.locals.db, timetable.id, preset.entries)) === null) return fail(400, { message: TOO_MANY });
	}
};
