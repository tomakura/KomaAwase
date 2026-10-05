import { and, asc, eq, type Column } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import {
	calendarEntries,
	courseAbsences,
	courseMoves,
	courseFiles,
	courseNotes,
	courseSlots,
	courseTeachers,
	courseTerms,
	courses,
	events,
	groups,
	groupMembers,
	periods,
	terms,
	timetables,
	universities,
	users
} from './db/schema';
import { listFriendships } from './friends';
import { syncedValues } from './shared-courses';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Everything a person has in the app that is theirs, for the file they can save (その他 → 自分のデータを保存) */
export async function exportData(db: Db, user: { id: string }) {
	const me = user.id;
	const own = (table: { timetableId: Column }) => eq(table.timetableId, timetables.id);
	const [account, tables, termRows, periodRows, courseRows, termLinks, slots, teachers, notes, files, absences, eventRows, { friends }, groupRows, calendarRows, moveRows] =
		await Promise.all([
			db
				.select({
					email: users.email,
					nickname: users.nickname,
					university: universities.name,
					daysShown: users.daysShown,
					theme: users.theme,
					notify: users.notify,
					createdAt: users.createdAt
				})
				.from(users)
				.leftJoin(universities, eq(universities.id, users.universityId))
				.where(eq(users.id, me))
				.get(),
			db.select().from(timetables).where(eq(timetables.userId, me)).orderBy(asc(timetables.year)),
			db
				.select({ timetableId: terms.timetableId, name: terms.name, group: terms.groupName, start: terms.startDate, end: terms.endDate, id: terms.id })
				.from(terms)
				.innerJoin(timetables, own(terms))
				.where(eq(timetables.userId, me))
				.orderBy(asc(terms.sortOrder)),
			db
				.select({ timetableId: periods.timetableId, number: periods.number, start: periods.startTime, end: periods.endTime })
				.from(periods)
				.innerJoin(timetables, own(periods))
				.where(eq(timetables.userId, me))
				.orderBy(asc(periods.number)),
			db.select({ course: courses }).from(courses).innerJoin(timetables, own(courses)).where(eq(timetables.userId, me)).orderBy(asc(courses.title)),
			db
				.select({ courseId: courseTerms.courseId, termId: courseTerms.termId })
				.from(courseTerms)
				.innerJoin(courses, eq(courses.id, courseTerms.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me)),
			db
				.select({ slot: courseSlots })
				.from(courseSlots)
				.innerJoin(courses, eq(courses.id, courseSlots.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me)),
			db
				.select({ courseId: courseTeachers.courseId, name: courseTeachers.name })
				.from(courseTeachers)
				.innerJoin(courses, eq(courses.id, courseTeachers.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me))
				.orderBy(asc(courseTeachers.sortOrder)),
			db
				.select({ note: courseNotes })
				.from(courseNotes)
				.innerJoin(courses, eq(courses.id, courseNotes.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me))
				.orderBy(asc(courseNotes.createdAt)),
			db
				.select({ id: courseFiles.id, courseId: courseFiles.courseId, name: courseFiles.name, mime: courseFiles.mime, size: courseFiles.size })
				.from(courseFiles)
				.innerJoin(courses, eq(courses.id, courseFiles.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me)),
			db
				.select({ courseId: courseAbsences.courseId, date: courseAbsences.date })
				.from(courseAbsences)
				.innerJoin(courses, eq(courses.id, courseAbsences.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me))
				.orderBy(asc(courseAbsences.date)),
			db.select().from(events).where(eq(events.userId, me)).orderBy(asc(events.date)),
			listFriendships(db, me),
			(() => {
				const mine = alias(groupMembers, 'mine');
				return db
					.select({ id: groups.id, name: groups.name, ownerId: groups.ownerId, member: users.nickname })
					.from(groups)
					.innerJoin(mine, and(eq(mine.groupId, groups.id), eq(mine.userId, me)))
					.innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
					.innerJoin(users, eq(users.id, groupMembers.userId))
					.orderBy(asc(groups.name));
			})(),
			db
				.select({ timetableId: calendarEntries.timetableId, kind: calendarEntries.kind, label: calendarEntries.label, start: calendarEntries.start, end: calendarEntries.end })
				.from(calendarEntries)
				.innerJoin(timetables, own(calendarEntries))
				.where(eq(timetables.userId, me))
				.orderBy(asc(calendarEntries.start)),
			db
				.select({ move: courseMoves })
				.from(courseMoves)
				.innerJoin(courses, eq(courses.id, courseMoves.courseId))
				.innerJoin(timetables, own(courses))
				.where(eq(timetables.userId, me))
				.orderBy(asc(courseMoves.fromDate))
		]);

	// A synced course is written as the timetable shows it: with the shared course's values
	const shared = await syncedValues(db, courseRows.map((r) => r.course));
	const sharedOf = (c: (typeof courseRows)[number]['course']) =>
		c.syncMode === 'synced' && c.sharedCourseId ? shared.get(c.sharedCourseId) : undefined;
	const termName = new Map(termRows.map((t) => [t.id, t.name]));
	const courseTitle = new Map(courseRows.map((r) => [r.course.id, sharedOf(r.course)?.values.title ?? r.course.title]));
	const by = <T extends { courseId: string }>(rows: T[], courseId: string) => rows.filter((r) => r.courseId === courseId);

	const groupList = new Map<string, { name: string; owner: boolean; members: string[] }>();
	for (const g of groupRows) {
		const entry = groupList.get(g.id) ?? { name: g.name, owner: g.ownerId === me, members: [] };
		entry.members.push(g.member ?? '');
		groupList.set(g.id, entry);
	}

	return {
		app: 'コマあわせ',
		format: 1,
		exportedAt: new Date().toISOString(),
		account: account && { ...account, createdAt: iso(account.createdAt) },
		timetables: tables.map((t) => ({
			year: t.year,
			name: t.name,
			archived: t.archived,
			terms: termRows.filter((x) => x.timetableId === t.id).map(({ name, group, start, end }) => ({ name, group, start, end })),
			periods: periodRows.filter((x) => x.timetableId === t.id).map(({ number, start, end }) => ({ number, start, end })),
			calendar: calendarRows.filter((x) => x.timetableId === t.id).map(({ kind, label, start, end }) => ({ kind, label, start, end })),
			courses: courseRows
				.filter((r) => r.course.timetableId === t.id)
				.map(({ course: c }) => {
					const synced = sharedOf(c);
					const v = synced?.values ?? {
						title: c.title,
						delivery: c.delivery,
						intensiveFrom: c.intensiveFrom,
						intensiveTo: c.intensiveTo,
						credits: c.credits,
						slots: slots
							.filter((s) => s.slot.courseId === c.id)
							.map(({ slot: s }) => ({ weekday: s.weekday, period: s.periodNumber, span: s.span, week: s.weekPattern, room: s.room })),
						teachers: by(teachers, c.id).map((x) => x.name)
					};
					return {
						title: v.title,
						color: c.color,
						shared: c.syncMode === 'synced',
						// Which shared course, and its version, when the values are its
						sharedCourse: synced ? { id: synced.id, version: synced.version } : null,
						delivery: v.delivery,
						intensiveFrom: v.intensiveFrom,
						intensiveTo: v.intensiveTo,
						credits: v.credits,
						absenceLimit: c.absenceLimit,
						absences: by(absences, c.id).map((a) => a.date),
						terms: termLinks.filter((l) => l.courseId === c.id).map((l) => termName.get(l.termId) ?? ''),
						slots: v.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, week: s.week, room: s.room })),
						teachers: v.teachers,
						notes: notes
							.filter((n) => n.note.courseId === c.id)
							.map(({ note: n }) => ({
								kind: n.kind,
								date: n.date,
								body: n.body,
								due: n.due,
								dueTime: n.dueTime,
								submitTo: n.submitTo,
								steps: n.steps,
								done: n.done
							})),
						moves: moveRows
							.filter((m) => m.move.courseId === c.id)
							.map(({ move: m }) => ({ from: m.fromDate, to: m.toDate, period: m.period, span: m.span, room: m.room })),
						// Where the file itself is read from, for a backup that includes the files (backup.ts)
						files: by(files, c.id).map(({ id, name, mime, size }) => ({ name, mime, size, url: `/courses/${c.id}/files/${id}` }))
					};
				})
		})),
		events: eventRows.map((e) => ({
			title: e.title,
			date: e.date,
			start: e.startTime,
			end: e.endTime,
			place: e.place,
			memo: e.memo,
			exam: e.exam,
			scope: e.scope,
			bring: e.bring,
			course: e.courseId ? (courseTitle.get(e.courseId) ?? null) : null
		})),
		// Only the nicknames
		friends: friends.map((f) => f.nickname),
		groups: [...groupList.values()]
	};
}
