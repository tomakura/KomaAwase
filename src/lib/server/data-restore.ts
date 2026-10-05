// Putting back the file saved from その他 → データの保存と復元 (exportData). Everything in the
// file is checked and bounded here: it came from the person's device and may have been edited.
// Nothing is taken from it by id; every row is made new in this account.
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { ABSENCE_LIMIT_MAX, CREDITS_MAX, isCourseColor, isWeekPattern, type WeekPattern } from '$lib/courses';
import { normalizeTitle } from '$lib/overlay';
import { academicYear, isDate, tokyoTime } from '$lib/time';
import type { Db } from './db';
import {
	courseAbsences,
	courseFiles,
	courseNotes,
	courseSlots,
	courseTeachers,
	courseTerms,
	courses,
	events,
	periods,
	sharedCourses,
	terms,
	timetables
} from './db/schema';
import { chunks } from './timetable';
import { sharedAccess } from './verify';

const TIMETABLES_MAX = 20;
const COURSES_MAX = 200;
const NOTES_MAX = 500;
const ABSENCES_MAX = 200;
const EVENTS_MAX = 3000;
const FILES_MAX = 100;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const text = (v: unknown, max: number) => (typeof v === 'string' ? [...v.trim()].slice(0, max).join('') : '');
const textOrNull = (v: unknown, max: number) => text(v, max) || null;
const date = (v: unknown) => (typeof v === 'string' && isDate(v) ? v : null);
const time = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

export type BackupFile = { name: string; mime: string; size: number; path: string | null };
type Slot = { weekday: number; period: number; span: number; week: WeekPattern; room: string | null };
type Note = { kind: 'memo' | 'task' | 'cancel'; date: string | null; body: string; due: string | null; done: boolean };
export type BackupCourse = {
	title: string;
	color: string;
	sharedCourseId: string | null;
	delivery: 'ondemand' | 'intensive' | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
	credits: number | null;
	absenceLimit: number | null;
	absences: string[];
	terms: string[];
	slots: Slot[];
	teachers: string[];
	notes: Note[];
	files: BackupFile[];
};
export type BackupTimetable = {
	year: number;
	name: string;
	terms: { name: string; group: string | null; start: string | null; end: string | null }[];
	periods: { number: number; start: string; end: string }[];
	courses: BackupCourse[];
};
type BackupEvent = { title: string; date: string; start: string | null; end: string | null; place: string | null; memo: string | null; course: string | null };
export type Backup = { exportedAt: string | null; timetables: BackupTimetable[]; events: BackupEvent[] };

function readCourse(v: unknown, periodNumbers: number[]): BackupCourse | null {
	if (!isObject(v)) return null;
	const title = text(v.title, 60);
	if (!title) return null;
	const slots: Slot[] = [];
	for (const s of list(v.slots, 14)) {
		if (!isObject(s)) continue;
		const weekday = int(s.weekday, 1, 7);
		const period = int(s.period, 0, 20);
		const span = int(s.span, 1, 4) ?? 1;
		const start = period === null ? -1 : periodNumbers.indexOf(period);
		if (weekday === null || period === null || start < 0 || start + span > periodNumbers.length) continue;
		if (slots.some((o) => o.weekday === weekday && o.period <= period + span - 1 && period <= o.period + o.span - 1)) continue;
		slots.push({ weekday, period, span, week: isWeekPattern(s.week) ? s.week : 'every', room: textOrNull(s.room, 20) });
	}
	const sharedCourse = isObject(v.sharedCourse) && typeof v.sharedCourse.id === 'string' ? v.sharedCourse.id.slice(0, 64) : null;
	const credits = typeof v.credits === 'number' && v.credits >= 0 && v.credits <= CREDITS_MAX && Number.isInteger(v.credits * 2) ? v.credits : null;
	const notes: Note[] = list(v.notes, NOTES_MAX).flatMap((n) => {
		if (!isObject(n) || (n.kind !== 'memo' && n.kind !== 'task' && n.kind !== 'cancel')) return [];
		const body = text(n.body, n.kind === 'memo' ? 1000 : 100);
		if (!body && n.kind !== 'cancel') return [];
		return [{ kind: n.kind, date: date(n.date), body, due: date(n.due), done: n.done === true }];
	});
	return {
		title,
		color: typeof v.color === 'string' && isCourseColor(v.color) ? v.color : 'gray',
		sharedCourseId: v.shared === true ? sharedCourse : null,
		delivery: slots.length ? null : v.delivery === 'intensive' ? 'intensive' : 'ondemand',
		intensiveFrom: slots.length ? null : date(v.intensiveFrom),
		intensiveTo: slots.length ? null : date(v.intensiveTo),
		credits,
		absenceLimit: int(v.absenceLimit, 1, ABSENCE_LIMIT_MAX),
		absences: [...new Set(list(v.absences, ABSENCES_MAX).flatMap((d) => date(d) ?? []))],
		terms: list(v.terms, 12).map((t) => text(t, 30)),
		slots,
		teachers: [...new Set(list(v.teachers, 10).map((t) => text(t, 30)).filter(Boolean))],
		notes,
		files: list(v.files, FILES_MAX).flatMap((f) =>
			isObject(f) && typeof f.name === 'string'
				? [{ name: text(f.name, 100), mime: text(f.mime, 100), size: int(f.size, 0, 1e9) ?? 0, path: typeof f.path === 'string' ? f.path.slice(0, 300) : null }]
				: []
		)
	};
}

/** The saved file as a backup, or null when it isn't one */
export function readBackup(raw: unknown): Backup | null {
	if (!isObject(raw) || raw.app !== 'コマあわせ' || raw.format !== 1 || !Array.isArray(raw.timetables)) return null;
	const years = new Set<number>();
	const tables: BackupTimetable[] = [];
	for (const t of list(raw.timetables, TIMETABLES_MAX)) {
		if (!isObject(t)) continue;
		const year = int(t.year, 2000, 2100);
		if (year === null || years.has(year)) continue;
		years.add(year);
		const periodRows = list(t.periods, 20).flatMap((p) => {
			if (!isObject(p)) return [];
			const number = int(p.number, 0, 20);
			const start = time(p.start);
			const end = time(p.end);
			return number !== null && start && end ? [{ number, start, end }] : [];
		});
		const uniquePeriods = periodRows.filter((p, i) => periodRows.findIndex((q) => q.number === p.number) === i).sort((a, b) => a.number - b.number);
		const numbers = uniquePeriods.map((p) => p.number);
		const termRows = list(t.terms, 12).flatMap((x) =>
			isObject(x) && text(x.name, 30) ? [{ name: text(x.name, 30), group: textOrNull(x.group, 30), start: date(x.start), end: date(x.end) }] : []
		);
		tables.push({
			year,
			name: text(t.name, 30) || `${year}年度`,
			terms: termRows.filter((x, i) => termRows.findIndex((y) => y.name === x.name) === i),
			periods: uniquePeriods,
			courses: list(t.courses, COURSES_MAX).flatMap((c) => readCourse(c, numbers) ?? [])
		});
	}
	const eventRows = list(raw.events, EVENTS_MAX).flatMap((e) => {
		if (!isObject(e)) return [];
		const title = text(e.title, 100);
		const day = date(e.date);
		if (!title || !day) return [];
		const start = time(e.start);
		const end = start ? time(e.end) : null;
		return [{ title, date: day, start, end: end && end > start! ? end : null, place: textOrNull(e.place, 50), memo: textOrNull(e.memo, 500), course: textOrNull(e.course, 60) }];
	});
	return { exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt.slice(0, 40) : null, timetables: tables, events: eventRows };
}

export type RestoreMode = 'add' | 'replace' | 'merge' | 'skip';

/** The person's timetables, by year, for choosing what each one in the file does */
export function ownTimetables(db: Db, userId: string) {
	return db
		.select({ id: timetables.id, year: timetables.year, name: timetables.name, courses: count(courses.id) })
		.from(timetables)
		.leftJoin(courses, eq(courses.timetableId, timetables.id))
		.where(eq(timetables.userId, userId))
		.groupBy(timetables.id);
}

/** How many files the courses of these timetables still keep (they go before a replace) */
export async function filesIn(db: Db, timetableIds: string[]) {
	if (!timetableIds.length) return [];
	return db
		.select({ id: courseFiles.id, storageKey: courseFiles.storageKey })
		.from(courseFiles)
		.innerJoin(courses, eq(courses.id, courseFiles.courseId))
		.where(inArray(courses.timetableId, timetableIds));
}

// Rows of one table as inserts of at most 100 bound values each (D1's limit)
function inserts<T extends SQLiteTable>(db: Db, table: T, rows: T['$inferInsert'][]): BatchItem<'sqlite'>[] {
	const per = Math.max(1, Math.floor(90 / Object.keys(getTableColumns(table)).length));
	return chunks(rows, per).map((part) => db.insert(table).values(part as never));
}

/**
 * Puts the chosen timetables back. 'add' makes the year's timetable (only when there is none;
 * there is one per year), 'replace' empties the year's timetable and fills it from the file,
 * 'merge' adds the courses it doesn't have yet (by name). Events go back unless already there.
 * One batch: it all happens or none of it does. Returns, for each timetable in the file, the
 * new course ids in the file's order (null for a course left out), and the files the browser
 * is to send to them.
 */
export async function restoreBackup(
	db: Db,
	user: { id: string; universityId: string | null },
	backup: Backup,
	modes: RestoreMode[],
	withEvents: boolean
) {
	const own = await ownTimetables(db, user.id);
	const statements: BatchItem<'sqlite'>[] = [];
	const courseIds: (string | null)[][] = [];
	// The files the browser has from a ZIP, to send to the new courses
	const uploads: { courseId: string; name: string; mime: string; path: string }[] = [];
	const restoredTitles = new Map<string, string>();
	const thisYear = academicYear(tokyoTime(Date.now()).date);

	for (const [i, t] of backup.timetables.entries()) {
		const mode = modes[i] ?? 'skip';
		const existing = own.find((o) => o.year === t.year);
		if (mode === 'skip' || (mode === 'add' && existing) || (mode !== 'add' && !existing)) {
			courseIds.push(t.courses.map(() => null));
			continue;
		}
		let timetableId: string;
		let universityId: string | null;
		let termIds: Map<string, string>;
		let periodNumbers: number[];
		let skipTitles = new Set<string>();
		if (mode === 'add') {
			timetableId = crypto.randomUUID();
			universityId = user.universityId;
			statements.push(db.insert(timetables).values({ id: timetableId, userId: user.id, universityId, year: t.year, name: t.name, archived: t.year < thisYear }));
		} else {
			timetableId = existing!.id;
			universityId = (await db.select({ u: timetables.universityId }).from(timetables).where(eq(timetables.id, timetableId)).get())?.u ?? null;
		}
		if (mode === 'merge') {
			// The timetable's own terms and periods stay; terms the file has and it doesn't are added after them
			const [termRows, periodRows, titleRows] = await db.batch([
				db.select({ id: terms.id, name: terms.name, sortOrder: terms.sortOrder }).from(terms).where(eq(terms.timetableId, timetableId)),
				db.select({ number: periods.number }).from(periods).where(eq(periods.timetableId, timetableId)),
				db.select({ title: courses.title }).from(courses).where(eq(courses.timetableId, timetableId))
			]);
			termIds = new Map(termRows.map((r) => [r.name, r.id]));
			const last = Math.max(-1, ...termRows.map((r) => r.sortOrder));
			const added = t.terms.filter((x) => !termIds.has(x.name)).map((x, j) => ({ id: crypto.randomUUID(), timetableId, name: x.name, groupName: x.group, startDate: x.start, endDate: x.end, sortOrder: last + 1 + j }));
			for (const a of added) termIds.set(a.name, a.id);
			statements.push(...inserts(db, terms, added));
			periodNumbers = periodRows.map((r) => r.number).sort((a, b) => a - b);
			skipTitles = new Set(titleRows.map((r) => normalizeTitle(r.title)));
		} else {
			if (mode === 'replace') {
				// Files should be gone already (the page clears them first). One added since then
				// stops the batch, so its bytes are never left without a row. The id is ours, a UUID.
				if (!/^[0-9a-zA-Z-]{1,64}$/.test(timetableId)) throw new Error('timetable id');
				statements.push(
					db.run(
						sql.raw(`select json(case when (select count(*) from course_files f join courses c on c.id = f.course_id
						where c.timetable_id = '${timetableId}') = 0 then 'true' else 'files left' end)`)
					),
					db.delete(courses).where(eq(courses.timetableId, timetableId)),
					db.delete(terms).where(eq(terms.timetableId, timetableId)),
					db.delete(periods).where(eq(periods.timetableId, timetableId)),
					db.update(timetables).set({ name: t.name }).where(eq(timetables.id, timetableId))
				);
			}
			const termRows = t.terms.map((x, j) => ({ id: crypto.randomUUID(), timetableId, name: x.name, groupName: x.group, startDate: x.start, endDate: x.end, sortOrder: j }));
			termIds = new Map(termRows.map((r) => [r.name, r.id]));
			statements.push(...inserts(db, terms, termRows));
			statements.push(...inserts(db, periods, t.periods.map((p) => ({ timetableId, number: p.number, startTime: p.start, endTime: p.end }))));
			periodNumbers = t.periods.map((p) => p.number);
		}

		// Synced courses link again only to a shared course of the same university and year,
		// and only for someone with an enrollment check; otherwise they come back as their own
		const wanted = [...new Set(t.courses.flatMap((c) => (c.sharedCourseId ? [c.sharedCourseId] : [])))];
		const linkable = new Set(
			wanted.length && universityId && (await sharedAccess(db, user.id, universityId)) === 'ok'
				? (
						await db
							.select({ id: sharedCourses.id })
							.from(sharedCourses)
							.where(and(inArray(sharedCourses.id, wanted), eq(sharedCourses.universityId, universityId), eq(sharedCourses.year, t.year)))
					).map((r) => r.id)
				: []
		);

		const ids: (string | null)[] = [];
		const rows = { courses: [] as (typeof courses.$inferInsert)[], terms: [] as (typeof courseTerms.$inferInsert)[], slots: [] as (typeof courseSlots.$inferInsert)[], teachers: [] as (typeof courseTeachers.$inferInsert)[], notes: [] as (typeof courseNotes.$inferInsert)[], absences: [] as (typeof courseAbsences.$inferInsert)[] };
		for (const c of t.courses) {
			const key = normalizeTitle(c.title);
			const termList = [...new Set(c.terms.flatMap((n) => termIds.get(n) ?? []))];
			if (skipTitles.has(key) || !termList.length) {
				ids.push(null);
				continue;
			}
			skipTitles.add(key);
			const id = crypto.randomUUID();
			ids.push(id);
			restoredTitles.set(key, id);
			const linked = c.sharedCourseId && linkable.has(c.sharedCourseId) ? c.sharedCourseId : null;
			rows.courses.push({
				id,
				timetableId,
				title: c.title,
				color: c.color,
				delivery: c.delivery,
				intensiveFrom: c.intensiveFrom,
				intensiveTo: c.intensiveTo,
				credits: c.credits,
				absenceLimit: c.absenceLimit,
				syncMode: linked ? 'synced' : 'personal',
				sharedCourseId: linked
			});
			rows.terms.push(...termList.map((termId) => ({ courseId: id, termId })));
			rows.slots.push(...c.slots.filter((s) => periodNumbers.includes(s.period)).map((s) => ({ courseId: id, weekday: s.weekday, periodNumber: s.period, span: s.span, weekPattern: s.week, room: s.room })));
			rows.teachers.push(...c.teachers.map((name, sortOrder) => ({ courseId: id, name, sortOrder })));
			rows.notes.push(...c.notes.map((n) => ({ courseId: id, kind: n.kind, date: n.date, body: n.body, due: n.due, done: n.done })));
			rows.absences.push(...c.absences.map((d) => ({ courseId: id, date: d })));
			uploads.push(...c.files.flatMap((f) => (f.path ? [{ courseId: id, name: f.name, mime: f.mime, path: f.path }] : [])));
		}
		statements.push(
			...inserts(db, courses, rows.courses),
			...inserts(db, courseTerms, rows.terms),
			...inserts(db, courseSlots, rows.slots),
			...inserts(db, courseTeachers, rows.teachers),
			...inserts(db, courseNotes, rows.notes),
			...inserts(db, courseAbsences, rows.absences)
		);
		courseIds.push(ids);
	}

	let eventCount = 0;
	if (withEvents && backup.events.length) {
		const have = await db.select({ title: events.title, date: events.date, start: events.startTime }).from(events).where(eq(events.userId, user.id));
		const seen = new Set(have.map((e) => `${e.title}\u0000${e.date}\u0000${e.start ?? ''}`));
		const add = backup.events.filter((e) => {
			const k = `${e.title}\u0000${e.date}\u0000${e.start ?? ''}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
		eventCount = add.length;
		statements.push(
			...inserts(
				db,
				events,
				add.map((e) => ({
					userId: user.id,
					title: e.title,
					date: e.date,
					startTime: e.start,
					endTime: e.end,
					place: e.place,
					memo: e.memo,
					courseId: e.course ? (restoredTitles.get(normalizeTitle(e.course)) ?? null) : null
				}))
			)
		);
	}

	if (statements.length) {
		const [head, ...tail] = statements;
		await db.batch([head, ...tail]);
	}
	return { courseIds, eventCount, uploads };
}
