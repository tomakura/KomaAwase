// Checking what was read (from a screenshot or a CSV) before it goes in the timetable: the
// parts worth a second look, and how each course compares with what is already there.
import { normalizeTitle } from './overlay';

type Slot = { weekday: number; period: number; span: number; room: string | null };

// Marks OCR leaves for what it couldn't read, and the replacement character
const UNREADABLE = /[?？□■◇◆〓�]/;

/**
 * Whether a title is worth checking: it has a mark that stands for something unread, or is a
 * single letter (two is common: 英語, 体育). Decided here, not by the AI: models say they are sure when they aren't.
 */
export function titleDoubt(title: string) {
	const t = title.trim();
	return UNREADABLE.test(t) || [...t].length <= 1;
}

export type Existing = {
	id: string;
	title: string;
	// Reads the shared course's values: changed from its own page, never from an import
	synced: boolean;
	sharedCourseId: string | null;
	slots: Slot[];
	teachers: string[];
	termIds: string[];
};

export type Comparison =
	| { kind: 'new' }
	| { kind: 'same'; course: Existing }
	| { kind: 'changed'; course: Existing; diffs: string[] }
	| { kind: 'clash'; titles: string[] };

const overlaps = (a: Slot, b: Slot) =>
	a.weekday === b.weekday && a.period <= b.period + b.span - 1 && b.period <= a.period + a.span - 1;
const slotKey = (s: Slot) => `${s.weekday}-${s.period}-${s.span}`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * A course that was read, against the courses in the chosen terms: new, already there as it
 * is, there under the same name with something different, or in a slot another course has.
 * A room or teacher left blank in what was read is not counted as a difference.
 */
export function compareCourse(
	row: { title: string; slots: Slot[]; teachers: string[]; sharedId?: string | null },
	terms: string[],
	existing: Existing[]
): Comparison {
	const here = existing.filter((c) => c.termIds.some((id) => terms.includes(id)));
	const title = normalizeTitle(row.title);
	const course = here.find((c) => normalizeTitle(c.title) === title);
	if (course) {
		// Matched to the shared course this one already reads
		if (row.sharedId && course.synced && course.sharedCourseId === row.sharedId) return { kind: 'same', course };
		const diffs: string[] = [];
		if (!sameSet(row.slots.map(slotKey), course.slots.map(slotKey))) diffs.push('曜日・時限');
		const at = (s: Slot) => course.slots.find((c) => c.weekday === s.weekday && c.period === s.period);
		if (row.slots.some((s) => s.room && at(s) && (at(s)!.room ?? '') !== s.room)) diffs.push('教室');
		if (row.teachers.length && !sameSet(row.teachers.map(normalizeTitle), course.teachers.map(normalizeTitle))) diffs.push('先生');
		return diffs.length ? { kind: 'changed', course, diffs } : { kind: 'same', course };
	}
	const titles = [...new Set(here.filter((c) => c.slots.some((a) => row.slots.some((b) => overlaps(a, b)))).map((c) => c.title))];
	return titles.length ? { kind: 'clash', titles } : { kind: 'new' };
}

// Two titles' shared pairs of characters, out of all their pairs: 0 for nothing alike, 1 the same
function bigramShare(a: string, b: string) {
	const pairs = (t: string) => {
		const out = new Map<string, number>();
		for (let i = 0; i + 1 < t.length; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
		return out;
	};
	const x = pairs(a);
	const y = pairs(b);
	let shared = 0;
	for (const [pair, n] of x) shared += Math.min(n, y.get(pair) ?? 0);
	const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
	return total ? (2 * shared) / total : 0;
}

/**
 * How near a title read from an image is to a shared course's: 3 the same, or, for a name the
 * screen cut short, its start; 2 one holds the other or they are nearly the same (a letter
 * misread); 1 otherwise. The caller decides what 3 is worth: at one slot, the start of a name
 * can fit several courses.
 */
export function titleNearness(read: string, other: string, truncated = false) {
	const a = normalizeTitle(read);
	const b = normalizeTitle(other);
	if (a === b) return 3;
	if (truncated && [...a].length >= 2 && b.startsWith(a)) return 3;
	if (a.includes(b) || b.includes(a)) return 2;
	return bigramShare(a, b) >= 0.65 ? 2 : 1;
}
