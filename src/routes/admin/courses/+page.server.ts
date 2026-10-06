import { and, asc, count, desc, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { sharedCourseSlots, sharedCourses, universities } from '$lib/server/db/schema';
import { NO_TERM, adminSearchShared, sharedTermNames } from '$lib/server/shared-courses';
import type { PageServerLoad } from './$types';

// The shared courses for whoever runs the app: find one by name, teacher, code, weekday or
// period to fix it, fold it into another or delete it (/shared/[id]). Shown by weekday and period.
const LIMIT = 200;
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const [list, years] = await Promise.all([
		locals.db
			.select({ id: universities.id, name: universities.name, n: count() })
			.from(sharedCourses)
			.innerJoin(universities, eq(universities.id, sharedCourses.universityId))
			.groupBy(universities.id)
			.orderBy(universities.name),
		locals.db
			.selectDistinct({ universityId: sharedCourses.universityId, year: sharedCourses.year })
			.from(sharedCourses)
			.orderBy(desc(sharedCourses.year))
	]);
	// The admin's own university first, else the first in the list
	const asked = url.searchParams.get('u');
	const university = list.find((u) => u.id === asked) ?? list.find((u) => u.id === locals.user?.universityId) ?? list[0] ?? null;
	const yearsOf = years.filter((y) => y.universityId === university?.id).map((y) => y.year);
	const askedYear = Number(url.searchParams.get('y'));
	const year = yearsOf.includes(askedYear) ? askedYear : (yearsOf[0] ?? null);
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
	const terms = university && year !== null ? await sharedTermNames(locals.db, university.id, year) : [];
	// One term at a time, the first unless another is picked; 'all' is every term, split by term
	const askedTerm = url.searchParams.get('t') ?? '';
	const term = terms.includes(askedTerm) || askedTerm === NO_TERM || askedTerm === 'all' ? askedTerm : (terms[0] ?? 'all');
	const unused = url.searchParams.get('z') === '1';
	// The periods the university's courses of the year meet in, for the period picker
	const periods =
		university && year !== null
			? (
					await locals.db
						.selectDistinct({ n: sharedCourseSlots.periodNumber })
						.from(sharedCourseSlots)
						.innerJoin(sharedCourses, eq(sharedCourses.id, sharedCourseSlots.sharedCourseId))
						.where(and(eq(sharedCourses.universityId, university.id), eq(sharedCourses.year, year)))
						.orderBy(asc(sharedCourseSlots.periodNumber))
				).map((r) => r.n)
			: [];
	const askedDay = Number(url.searchParams.get('d'));
	const weekday = Number.isInteger(askedDay) && askedDay >= 1 && askedDay <= 7 ? askedDay : 0;
	const askedPeriod = Number(url.searchParams.get('p'));
	const period = periods.includes(askedPeriod) ? askedPeriod : 0;
	const results =
		university && year !== null
			? await adminSearchShared(locals.db, {
					universityId: university.id,
					year,
					q,
					term: term === 'all' ? undefined : term,
					unused,
					weekday: weekday || undefined,
					period: period || undefined,
					limit: LIMIT
				})
			: [];
	return {
		periods,
		weekday,
		period,
		limit: LIMIT,
		noTerm: NO_TERM,
		removed: url.searchParams.get('removed') === '1',
		terms,
		term,
		unused,
		universities: list.map(({ id, name }) => ({ id, name })),
		university: university?.id ?? null,
		years: yearsOf,
		year,
		q,
		results: results.map((c) => ({
			id: c.id,
			source: c.source,
			users: c.users,
			using: c.using,
			title: c.values.title,
			courseTerms: c.terms,
			teachers: c.values.teachers,
			slots: c.values.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span, room: s.room }))
		}))
	};
};
