import { asc, eq } from 'drizzle-orm';
import type { Db } from './db';
import { universities } from './db/schema';

export const UNIVERSITY_NAME_MAX = 40;

// Full-width letters and odd spaces are folded so 「東京　大学」 and 「東京大学」 are one university.
export function normalizeUniversityName(input: string) {
	return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

// Names for the suggestions in はじめの設定 and 大学; preset universities first.
export async function listUniversities(db: Db) {
	const rows = await db
		.select({
			id: universities.id,
			name: universities.name,
			source: universities.source,
			termPreset: universities.termPreset,
			periodPreset: universities.periodPreset
		})
		.from(universities)
		.orderBy(asc(universities.name))
		.limit(500);
	return rows.toSorted((a, b) => Number(a.source !== 'preset') - Number(b.source !== 'preset'));
}

export function getUniversity(db: Db, id: string) {
	return db.select().from(universities).where(eq(universities.id, id)).get();
}

/** The university with this name, added as a user-made one (no presets) when it's new. */
export async function findOrCreateUniversity(db: Db, input: string) {
	const name = normalizeUniversityName(input);
	if (!name || [...name].length > UNIVERSITY_NAME_MAX) return null;
	await db.insert(universities).values({ name, source: 'user' }).onConflictDoNothing({ target: universities.name });
	return (await db.select().from(universities).where(eq(universities.name, name)).get()) ?? null;
}

// Addresses on an allowed domain or a dot-separated subdomain of one. A plain suffix check
// would let notexample.ac.jp through for example.ac.jp.
export function emailMatchesDomains(email: string, domains: string[]) {
	const host = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
	return domains.some((d) => host === d || host.endsWith(`.${d}`));
}
