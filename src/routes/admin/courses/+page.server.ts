import { count, desc, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { sharedCourses, universities } from '$lib/server/db/schema';
import { adminSearchShared, sharedTermNames } from '$lib/server/shared-courses';
import type { PageServerLoad } from './$types';

// The shared courses for whoever runs the app: find one by name, teacher or code to fix it
// or fold it into another (/shared/[id]).
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
	const askedTerm = url.searchParams.get('t') ?? '';
	const term = terms.includes(askedTerm) ? askedTerm : '';
	const unused = url.searchParams.get('z') === '1';
	const results =
		university && year !== null
			? await adminSearchShared(locals.db, { universityId: university.id, year, q, term: term || undefined, unused })
			: [];
	return {
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
			teachers: c.values.teachers,
			slots: c.values.slots.map((s) => ({ weekday: s.weekday, period: s.period, span: s.span }))
		}))
	};
};
