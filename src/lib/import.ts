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
	// Read from a row whose cells didn't match the weekday headings: the weekday is a guess
	check?: true;
};

// The AI copies the table out row by row, cell by cell, as it looks; weekdays and periods
// come from its headers here. Asked for each course's weekday instead, models lost track
// of the columns (a Monday class came back as Thursday) and skipped courses.
// Strict mode needs every field required and no extra ones.
const CELL = {
	type: 'object',
	properties: {
		title: { type: 'string', description: '授業名。空いているマスは空文字' },
		room: { type: 'string', description: '教室。なければ空文字' },
		teacher: { type: 'string', description: '先生の名前。なければ空文字' }
	},
	required: ['title', 'room', 'teacher'],
	additionalProperties: false
} as const;

export const IMPORT_SCHEMA = {
	type: 'object',
	properties: {
		days: { type: 'array', items: { type: 'string' }, description: '曜日の見出し。左から順に' },
		rows: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					period: { type: 'integer', description: 'その行の時限の番号。1限なら1' },
					cells: { type: 'array', items: CELL, description: 'その行のマス。左の列から順に days と同じ数' }
				},
				required: ['period', 'cells'],
				additionalProperties: false
			}
		}
	},
	required: ['days', 'rows'],
	additionalProperties: false
} as const;

// Tried on real screenshots: one more rule (leave out notes and ads) made Llama 4 Scout
// garble kanji, so the prompt stays this short.
export const IMPORT_PROMPT = [
	'これは大学の時間割アプリのスクリーンショットです。表を上の行から順に、そのまま書き写してJSONで返してください。',
	'- days: いちばん上の曜日の見出しを、左から順に（例: ["月","火","水","木","金"]）',
	'- rows: 時限の行ごとに1つ。period はその行の時限の番号（1限なら1）。番号がなく時刻だけなら、上から1、2、3…と数える',
	'- cells: その行のマスを、左の列から順に days と同じ数だけ。授業が入っていないマスは title・room・teacher を空文字',
	'- title はマスの授業名。マスの中で改行されていても1つにつなげる',
	'- room はマスにある教室、teacher は先生の名前。なければ空文字',
	'- 同じ授業が上下のマスに続いていても、それぞれの行に書く',
	'- 読めない文字を想像で埋めない'
].join('\n');

// A screenshot whose cells the browser has cut out and stacked, each with a pink tag beside it
// (see import-grid.ts). The tag says which column and row the cell came from, so the AI never
// has to count columns. Tags ending in 0 are the weekday headings.
export const IMPORT_TILE_SCHEMA = {
	type: 'object',
	properties: {
		courses: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					cell: { type: 'string', description: 'そのマスの左にあるピンクの札の文字。例 B1' },
					title: { type: 'string', description: '授業名。空のマスは空文字' },
					teacher: { type: 'string', description: '先生の名前。なければ空文字' },
					room: { type: 'string', description: '教室。なければ空文字' }
				},
				required: ['cell', 'title', 'teacher', 'room'],
				additionalProperties: false
			}
		}
	},
	required: ['courses'],
	additionalProperties: false
} as const;

export const IMPORT_TILE_PROMPT = [
	'これは大学の時間割のマスを縦に並べた画像です。各マスの左に、ピンクの札で B1 のような印があります。',
	'すべてのマスについて、次の4つを書き出してください。',
	'- cell: そのマスの左にあるピンクの札の文字（例 B1）',
	'- title: そのマスの太字の授業名の1行だけ（先生名・8桁の数字・N単位・複数回は含めない）。札が A0 のように0で終わるマスは曜日の見出しなので、title に曜日を書く',
	'- teacher: 先生の名前（なければ空文字）',
	'- room: 教室（なければ空文字）',
	'読めない文字を想像で埋めない'
].join('\n');

const DAYS = '月火水木金土日';
const DAYS_EN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// 1 = Monday … 7 = Sunday, from a header like 「月」「月曜」「Mon」
function weekdayOf(header: unknown) {
	if (typeof header !== 'string') return null;
	const ja = [...header].find((c) => DAYS.includes(c));
	if (ja) return DAYS.indexOf(ja) + 1;
	const en = DAYS_EN.findIndex((d) => header.trim().toLowerCase().startsWith(d));
	return en >= 0 ? en + 1 : null;
}

// The weekday of each column. A header it can't read follows the one before it.
function weekdaysOf(days: unknown[]) {
	let previous = 0;
	return days.map((d) => (previous = weekdayOf(d) ?? previous + 1));
}

/** The copied table as one entry per filled cell. */
function cellsOfGrid(days: unknown[], rows: unknown[]) {
	const weekdays = weekdaysOf(days);
	const out: Record<string, unknown>[] = [];
	let lastPeriod = 0;
	for (const row of rows) {
		if (typeof row !== 'object' || row === null) continue;
		const r = row as { period?: unknown; cells?: unknown };
		const period = Number.isInteger(r.period) ? (r.period as number) : lastPeriod + 1;
		lastPeriod = period;
		if (!Array.isArray(r.cells)) continue;
		// A row with more or fewer cells than headings may have its courses in the wrong columns
		const unsure = r.cells.length !== weekdays.length;
		r.cells.forEach((cell, i) => {
			if (typeof cell !== 'object' || cell === null) return;
			const c = cell as { title?: unknown; room?: unknown; teacher?: unknown };
			out.push({
				title: c.title,
				weekday: weekdays[i] ?? i + 1,
				period,
				span: 1,
				room: c.room,
				teachers: typeof c.teacher === 'string' ? splitTeachers(c.teacher) : [],
				...(unsure ? { check: true } : {})
			});
		});
	}
	return out;
}

// A tag is the column as a letter and the row as a number: B3 is the second column, third row.
// Row 0 is the weekday headings. The column decides the weekday, the row the period.
const TAG = /^([A-H])(\d{1,2})$/;

/** Reads what the AI wrote beside each tag of a stack of cells (IMPORT_TILE_PROMPT) */
function cellsOfTiles(tiles: unknown[]) {
	const headings: unknown[] = [];
	const found: { col: number; period: number; cell: { title?: unknown; room?: unknown; teacher?: unknown } }[] = [];
	for (const tile of tiles) {
		if (typeof tile !== 'object' || tile === null) continue;
		const t = tile as { cell?: unknown; title?: unknown; room?: unknown; teacher?: unknown };
		const tag = typeof t.cell === 'string' ? TAG.exec(t.cell.normalize('NFKC').replace(/\s+/g, '').toUpperCase()) : null;
		if (!tag) continue;
		const col = tag[1].charCodeAt(0) - 65;
		const period = Number(tag[2]);
		if (period === 0) headings[col] = t.title;
		else found.push({ col, period, cell: t });
	}
	// A column with no heading follows the one before it
	const columns = Math.max(headings.length, ...found.map((f) => f.col + 1));
	const weekdays = weekdaysOf(Array.from({ length: columns }, (_, i) => headings[i]));
	return found.map(({ col, period, cell }) => ({
		title: cell.title,
		weekday: weekdays[col],
		period,
		span: 1,
		room: cell.room,
		teachers: typeof cell.teacher === 'string' ? splitTeachers(cell.teacher) : []
	}));
}

/** Names separated by 、 , ／ or a new line. A space stays inside a name (「山田 太郎」). */
export function splitTeachers(text: string) {
	return text
		.split(/[、,，/／\n]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

const TITLE_MAX = 60;
const ROOM_MAX = 20;
const TEACHER_MAX = 30;
const TEACHERS_MAX = 10;
const SPAN_MAX = 4;
export const IMPORT_COURSES_MAX = 60;

const clip = (s: string, max: number) => [...s.trim()].slice(0, max).join('');

// A Roman numeral symbol (Ⅱ, Ⅳ) becomes the letters it is drawn with (II, IV): the symbol can't
// be typed on most keyboards, so a title with one would never match a search or a friend's.
const ROMAN = /[\u2160-\u217F]/g;

// What the student portal adds after a name. 【ｾｯﾄ履修】 is often misread (ｾｯﾄ comes out as セツト,
// "ﾉ ﾉ" and the like), so any trailing bracket with 履 in it goes, closed or not; a bracket
// without 履 is part of the name.
const SET_TAG = /\s*[【[［][^】\]］]*履[^】\]］]*(?:[】\]］]|$)\s*$/;
// The other tags are parentheses holding a class group or a code: (G1), (G2-SA), (SA-01). They
// are told from a name in parentheses by a segment that is G and a number, or SA.
const PAREN_TAIL = /\s*[(（]([^()（）]*)(?:[)）]|$)\s*$/;
const PORTAL_CODE = /^(?:[A-Z0-9○〇◯]+-)*(?:G\d+|SA)(?:-[A-Z0-9○〇◯]+)*$/i;

function withoutTag(title: string) {
	const set = title.replace(SET_TAG, '');
	if (set !== title) return set;
	const paren = PAREN_TAIL.exec(title);
	if (!paren) return title;
	// Full-width letters fold with NFKC; the dashes OCR may give (‐―, −, ー) become -
	const code = paren[1]
		.normalize('NFKC')
		.replace(/\s+/g, '')
		.replace(/[\u2010-\u2015\u2212\u30FC]/g, '-');
	return PORTAL_CODE.test(code) ? title.slice(0, paren.index) : title;
}

/** A title as it is kept: Roman numerals as letters, the portal's tags left off */
export function cleanTitle(title: string) {
	let t = title.replace(ROMAN, (c) => c.normalize('NFKC'));
	for (let before = ''; before !== t; ) {
		before = t;
		t = withoutTag(t);
	}
	return t.trim();
}

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
	const answer = raw as { courses?: unknown; days?: unknown; rows?: unknown } | null;
	const tiled = Array.isArray(answer?.courses) && answer.courses.some((c) => typeof (c as { cell?: unknown } | null)?.cell === 'string');
	const list =
		Array.isArray(answer?.days) && Array.isArray(answer?.rows)
			? cellsOfGrid(answer.days, answer.rows)
			: tiled
				? cellsOfTiles(answer!.courses as unknown[])
				: answer?.courses;
	if (!Array.isArray(list)) return null;

	const out: ImportedCourse[] = [];
	for (const item of list.slice(0, IMPORT_COURSES_MAX * 4)) {
		if (typeof item !== 'object' || item === null) continue;
		const c = item as Record<string, unknown>;
		const title = typeof c.title === 'string' ? clip(cleanTitle(c.title), TITLE_MAX) : '';
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
				: [],
			...(c.check === true ? { check: true as const } : {})
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
			prev.teachers = [...new Set([...prev.teachers, ...c.teachers])].slice(0, TEACHERS_MAX);
			if (c.check) prev.check = true;
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
		group.slots.push({ weekday: c.weekday, period: c.period, span: c.span, room: c.room, ...(c.check ? { check: true as const } : {}) });
		groups.set(key(c.title), group);
	}
	return [...groups.values()];
}
