// Reading a timetable screenshot with an AI: what it is asked for, and how its answer is
// checked before anyone sees it. Both providers get the same schema, so either can be swapped.
import { normalizeTitle } from './overlay';

export type ImportedCourse = {
	title: string;
	weekday: number; // 1 = Monday ... 7 = Sunday
	period: number;
	span: number;
	room: string;
	teachers: string[];
};

// Strict mode needs every field required and no extra ones.
export const IMPORT_SCHEMA = {
	type: 'object',
	properties: {
		courses: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					title: { type: 'string', description: '授業名' },
					weekday: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7], description: '曜日。月=1 … 日=7' },
					period: { type: 'integer', description: '時限の番号。1限なら1' },
					span: { type: 'integer', description: '続けて何コマか。ふつうは1' },
					room: { type: 'string', description: '教室。書かれていなければ空文字' },
					teachers: { type: 'array', items: { type: 'string' }, description: '先生の名前。なければ空' }
				},
				required: ['title', 'weekday', 'period', 'span', 'room', 'teachers'],
				additionalProperties: false
			}
		}
	},
	required: ['courses'],
	additionalProperties: false
} as const;

export const IMPORT_PROMPT = [
	'これは大学の時間割アプリのスクリーンショットです。写っている授業を、曜日と時限ごとにJSONで返してください。',
	'- 曜日は月=1、火=2、水=3、木=4、金=5、土=6、日=7',
	'- 時限は画像にある番号（1限なら1）。番号がなく時刻だけなら、上から1、2、3…と数える',
	'- 2コマ続きで1つの枠になっている授業は span を2にする。同じ授業が別の曜日にもあれば、それぞれ1件ずつ入れる',
	'- 教室が書かれていなければ room は空文字、先生が書かれていなければ teachers は空の配列',
	'- 空いているコマや、授業ではないもの（メモ、広告、アプリのボタン）は入れない',
	'- 読めない文字を想像で埋めない。読めるとおりに書く'
].join('\n');

const TITLE_MAX = 60;
const ROOM_MAX = 20;
const TEACHER_MAX = 30;
const TEACHERS_MAX = 10;
const SPAN_MAX = 4;
export const IMPORT_COURSES_MAX = 60;

const clip = (s: string, max: number) => [...s.trim()].slice(0, max).join('');

/**
 * The AI's answer as courses, or null when it isn't the requested shape. Values are
 * trimmed and bounded; the two halves of a double class given as two entries become one.
 */
export function readImport(raw: unknown): ImportedCourse[] | null {
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	const list = (raw as { courses?: unknown } | null)?.courses;
	if (!Array.isArray(list)) return null;

	const out: ImportedCourse[] = [];
	for (const item of list.slice(0, IMPORT_COURSES_MAX * 2)) {
		if (typeof item !== 'object' || item === null) continue;
		const c = item as Record<string, unknown>;
		const title = typeof c.title === 'string' ? clip(c.title, TITLE_MAX) : '';
		const weekday = Number(c.weekday);
		const period = Number(c.period);
		const span = Number(c.span ?? 1);
		if (!title || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
		if (!Number.isInteger(period) || period < 0 || period > 12) continue;
		out.push({
			title,
			weekday,
			period,
			span: Number.isInteger(span) && span >= 1 && span <= SPAN_MAX ? span : 1,
			room: typeof c.room === 'string' ? clip(c.room, ROOM_MAX) : '',
			teachers: Array.isArray(c.teachers)
				? [...new Set(c.teachers.filter((t): t is string => typeof t === 'string').map((t) => clip(t, TEACHER_MAX)))]
						.filter(Boolean)
						.slice(0, TEACHERS_MAX)
				: []
		});
	}

	out.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
	const merged: ImportedCourse[] = [];
	for (const c of out) {
		const prev = merged.at(-1);
		if (
			prev &&
			prev.title === c.title &&
			prev.weekday === c.weekday &&
			prev.period + prev.span === c.period &&
			prev.span + c.span <= SPAN_MAX
		) {
			prev.span += c.span;
			prev.room ||= c.room;
			continue;
		}
		// The same slot twice is a misread; the first stays.
		if (merged.some((m) => m.weekday === c.weekday && m.period <= c.period && c.period < m.period + m.span)) continue;
		merged.push({ ...c });
	}
	return merged.slice(0, IMPORT_COURSES_MAX);
}

// Courses that meet several times a week are one course with several slots.
export function groupImported(courses: ImportedCourse[]) {
	const key = normalizeTitle;
	const groups = new Map<string, { title: string; teachers: string[]; slots: Omit<ImportedCourse, 'title' | 'teachers'>[] }>();
	for (const c of courses) {
		const group = groups.get(key(c.title)) ?? { title: c.title, teachers: [], slots: [] };
		group.teachers = [...new Set([...group.teachers, ...c.teachers])];
		group.slots.push({ weekday: c.weekday, period: c.period, span: c.span, room: c.room });
		groups.set(key(c.title), group);
	}
	return [...groups.values()];
}
