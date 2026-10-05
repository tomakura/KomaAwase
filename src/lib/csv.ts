// Courses typed into a spreadsheet and saved as CSV (授業の追加 → CSV から入力). The rows go
// through the same checks as a screenshot's (readImport) and the same review.

/** The cells of a CSV text: quoted cells may hold commas, quotes ("") and new lines */
export function parseCsv(text: string, maxRows = 500) {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const s = text.replace(/^﻿/, '');
	for (let i = 0; i < s.length && rows.length < maxRows; i++) {
		const ch = s[i];
		if (quoted) {
			if (ch === '"' && s[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"' && cell === '') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && s[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	if ((cell || row.length) && rows.length < maxRows) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim()));
}

export const CSV_COLUMNS = ['授業名', '曜日', '時限', 'コマ数', '教室', '先生', '単位'] as const;
type Column = (typeof CSV_COLUMNS)[number];

// Other headings people may write for each column
const ALIASES: Record<Column, string[]> = {
	授業名: ['授業名', '科目名', '授業', '科目', '講義名'],
	曜日: ['曜日'],
	時限: ['時限', '限', 'コマ'],
	コマ数: ['コマ数', '連続'],
	教室: ['教室', '場所'],
	先生: ['先生', '教員', '担当', '担当教員', '教員名'],
	単位: ['単位', '単位数']
};

/** A filled-in example, for the template file */
export const CSV_TEMPLATE = `${CSV_COLUMNS.join(',')}\r\n線形代数,月,2,1,A101,山田 太郎,2\r\n英語コミュニケーション,水,3,2,B205,"佐藤、鈴木",1\r\n`;

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

function weekdayOf(text: string) {
	const t = text.normalize('NFKC').trim();
	const i = WEEKDAYS.indexOf(t[0] ?? '');
	if (i >= 0) return i + 1;
	const en = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(t.slice(0, 3).toLowerCase());
	return en >= 0 ? en + 1 : null;
}

const numberOf = (text: string) => {
	const t = text.normalize('NFKC').replace(/[限コマ単位\s]/g, '');
	return t === '' ? null : Number(t);
};

/**
 * The CSV's rows as course entries for readImport, and the line numbers that couldn't be read.
 * With a heading row the columns are found by name, in any order; without one they are taken
 * in the template's order.
 */
export function coursesOfCsv(rows: string[][]) {
	const head = rows[0]?.map((c) => c.normalize('NFKC').trim()) ?? [];
	const found = Object.fromEntries(
		CSV_COLUMNS.map((col) => [col, head.findIndex((h) => ALIASES[col].some((a) => a.normalize('NFKC') === h))])
	) as Record<Column, number>;
	const hasHead = found['授業名'] >= 0;
	const index = hasHead ? found : (Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, i])) as Record<Column, number>);
	const courses: Record<string, unknown>[] = [];
	const skipped: number[] = [];
	(hasHead ? rows.slice(1) : rows).forEach((r, i) => {
		const line = i + (hasHead ? 2 : 1);
		const get = (col: Column) => (index[col] >= 0 ? (r[index[col]] ?? '').trim() : '');
		const title = get('授業名');
		const weekday = weekdayOf(get('曜日'));
		const period = numberOf(get('時限'));
		const span = numberOf(get('コマ数')) ?? 1;
		const credits = numberOf(get('単位'));
		if (!title || !weekday || period === null || !Number.isInteger(period)) {
			skipped.push(line);
			return;
		}
		courses.push({
			title,
			weekday,
			period,
			span,
			room: get('教室'),
			teachers: get('先生')
				.split(/[、,，/／]+/)
				.map((t) => t.trim())
				.filter(Boolean),
			...(credits !== null && Number.isFinite(credits) ? { credits } : {})
		});
	});
	return { courses, skipped };
}
