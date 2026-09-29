// Finding the table in a timetable screenshot, so each filled cell can be cut out and sent
// on its own. Asked to read a whole screenshot, both AIs lost count of the columns (a Wednesday
// class came back as Thursday) and nothing said so. Given each cell with a tag beside it, the
// column is decided here and there is nothing left to miscount.
//
// A table is drawn with something running the whole way down or across between its cells: a
// grid line, or the gap between cards. It is one colour, so a column of pixels that is mostly
// that colour is a separator. Which colour it is differs from app to app, so each colour that
// fills most of some column or row is tried, and the one that cuts the most even cells wins.

/** RGBA, as from a canvas' getImageData */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
/** From, up to but not including */
export type Span = [number, number];

export type Grid = {
	cols: Span[];
	rows: Span[];
	/** [row][col]: true where a class is written (or a coloured card stands empty of text) */
	filled: boolean[][];
	/** The band above the first row, where the weekday headings are; null when there is none */
	header: Span | null;
};

export type Tile = { col: number; row: number; x: number; y: number; w: number; h: number };

// How far a pixel may be from the separator's colour (the second is for lines a JPEG or a
// smaller copy has blurred, where the first finds nothing), and how much of a column has to be that colour
const TOLERANCES = [10, 24];
const COVERAGE = 0.45;
const SAMPLES = 240;
// A timetable has at least a few weekdays and periods; fewer found means most of the lines were missed
const COLS_MIN = 3;
const COLS_MAX = 8;
const ROWS_MIN = 3;
const ROWS_MAX = 14;
// A cell with this much of its area unlike its background has something written in it
const INK = 0.008;

type Colour = [number, number, number];

const key = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const near = (d: Uint8ClampedArray, i: number, c: Colour, tolerance: number) =>
	Math.abs(d[i] - c[0]) <= tolerance && Math.abs(d[i + 1] - c[1]) <= tolerance && Math.abs(d[i + 2] - c[2]) <= tolerance;

/** The most common colour among the pixels at these offsets, and the share of them it has */
function dominant(d: Uint8ClampedArray, offsets: number[]): { colour: Colour; share: number } {
	const counts = new Map<number, { n: number; colour: Colour }>();
	for (const i of offsets) {
		const k = key(d[i], d[i + 1], d[i + 2]);
		const entry = counts.get(k);
		if (entry) entry.n++;
		else counts.set(k, { n: 1, colour: [d[i], d[i + 1], d[i + 2]] });
	}
	let best = { n: 0, colour: [0, 0, 0] as Colour };
	for (const entry of counts.values()) if (entry.n > best.n) best = entry;
	return { colour: best.colour, share: offsets.length ? best.n / offsets.length : 0 };
}

const steps = (length: number) => {
	const step = Math.max(1, Math.floor(length / SAMPLES));
	return Array.from({ length: Math.ceil(length / step) }, (_, i) => i * step);
};

/** The runs of true, as [from, to) */
function runs(flags: boolean[]) {
	const out: Span[] = [];
	for (let i = 0; i < flags.length; ) {
		if (!flags[i]) {
			i++;
			continue;
		}
		let j = i;
		while (j < flags.length && flags[j]) j++;
		out.push([i, j]);
		i = j;
	}
	return out;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** The spans between separators, without the ones that are much smaller or larger than the usual */
function cellsBetween(separators: Span[]) {
	const all: Span[] = [];
	for (let i = 0; i + 1 < separators.length; i++) {
		const span: Span = [separators[i][1], separators[i + 1][0]];
		if (span[1] - span[0] >= 8) all.push(span);
	}
	const usual = median(all.map(([a, b]) => b - a));
	const spans = all.filter(([a, b]) => b - a >= usual * 0.6 && b - a <= usual * 1.6);
	// A span twice the usual size between two good ones is two cells whose separator wasn't
	// found, and the cells after it would be counted as the wrong column
	const first = all.indexOf(spans[0]);
	const last = all.indexOf(spans[spans.length - 1]);
	if (all.slice(first, last + 1).some(([a, b]) => b - a > usual * 1.6)) return [];
	// Separators should be thin next to what they separate
	const gap = median(separators.map(([a, b]) => b - a));
	return gap * 2.5 <= usual ? spans : [];
}

function cut(img: Pixels, colour: Colour, tolerance: number) {
	const { data, width, height } = img;
	const ys = steps(height);
	const xs = steps(width);
	const colFlags: boolean[] = [];
	for (let x = 0; x < width; x++) {
		let hits = 0;
		for (const y of ys) if (near(data, (y * width + x) * 4, colour, tolerance)) hits++;
		colFlags.push(hits / ys.length >= COVERAGE);
	}
	const rowFlags: boolean[] = [];
	for (let y = 0; y < height; y++) {
		let hits = 0;
		for (const x of xs) if (near(data, (y * width + x) * 4, colour, tolerance)) hits++;
		rowFlags.push(hits / xs.length >= COVERAGE);
	}
	return { cols: cellsBetween(runs(colFlags)), rows: cellsBetween(runs(rowFlags)) };
}

/** Whether something is written in the cell, or it is coloured unlike the empty ones */
function look(img: Pixels, col: Span, row: Span) {
	const { data, width } = img;
	const inset = Math.max(2, Math.round(Math.min(col[1] - col[0], row[1] - row[0]) * 0.03));
	const offsets: number[] = [];
	const step = Math.max(1, Math.floor((row[1] - row[0]) / 60));
	const stepX = Math.max(1, Math.floor((col[1] - col[0]) / 60));
	for (let y = row[0] + inset; y < row[1] - inset; y += step)
		for (let x = col[0] + inset; x < col[1] - inset; x += stepX) offsets.push((y * width + x) * 4);
	const { colour } = dominant(data, offsets);
	let ink = 0;
	for (const i of offsets) if (!near(data, i, colour, 60)) ink++;
	return { colour, written: offsets.length > 0 && ink / offsets.length >= INK };
}

/** The table in the screenshot, or null when it doesn't look like one (then it is sent whole) */
export function findGrid(img: Pixels): Grid | null {
	const { data, width, height } = img;
	if (width < 100 || height < 100) return null;

	// Colours that fill most of some column or row
	const candidates = new Map<number, { n: number; colour: Colour }>();
	const consider = (offsets: number[]) => {
		const { colour, share } = dominant(data, offsets);
		if (share < COVERAGE) return;
		const k = key(colour[0], colour[1], colour[2]);
		const entry = candidates.get(k);
		if (entry) entry.n++;
		else candidates.set(k, { n: 1, colour });
	};
	const ys = steps(height);
	const xs = steps(width);
	for (let x = 0; x < width; x++) consider(ys.map((y) => (y * width + x) * 4));
	for (let y = 0; y < height; y++) consider(xs.map((x) => (y * width + x) * 4));

	let best: { cols: Span[]; rows: Span[] } | null = null;
	for (const tolerance of TOLERANCES) {
		for (const { colour } of [...candidates.values()].sort((a, b) => b.n - a.n).slice(0, 6)) {
			const found = cut(img, colour, tolerance);
			if (found.cols.length < COLS_MIN || found.cols.length > COLS_MAX || found.rows.length < ROWS_MIN || found.rows.length > ROWS_MAX) continue;
			if (!best || found.cols.length * found.rows.length > best.cols.length * best.rows.length) best = found;
		}
		if (best) break;
	}
	if (!best) return null;

	const looks = best.rows.map((row) => best!.cols.map((col) => look(img, col, row)));
	// The empty ones are the most common colour
	const usual = mostCommon(looks.flat().map((l) => l.colour));
	const filled = looks.map((row) =>
		row.map((l) => l.written || Math.max(...l.colour.map((c, i) => Math.abs(c - usual[i]))) > 24)
	);
	if (!filled.flat().some(Boolean)) return null;

	// The headings sit just above the first row, in a band about half a row tall
	const firstRow = best.rows[0];
	const band = Math.min(firstRow[0], Math.round((firstRow[1] - firstRow[0]) * 0.5));
	return { ...best, filled, header: band >= 12 ? [firstRow[0] - band, firstRow[0]] : null };
}

function mostCommon(colours: Colour[]): Colour {
	const counts = new Map<number, { n: number; colour: Colour }>();
	for (const c of colours) {
		const k = key(...c);
		const entry = counts.get(k);
		if (entry) entry.n++;
		else counts.set(k, { n: 1, colour: c });
	}
	return [...counts.values()].sort((a, b) => b.n - a.n)[0].colour;
}

/** The pieces to send: the weekday headings (row 0), then every filled cell, left to right and top to bottom */
export function tiles(grid: Grid): Tile[] {
	const out: Tile[] = [];
	if (grid.header) {
		grid.cols.forEach((c, col) =>
			out.push({ col, row: 0, x: c[0], y: grid.header![0], w: c[1] - c[0], h: grid.header![1] - grid.header![0] })
		);
	}
	grid.rows.forEach((r, row) =>
		grid.cols.forEach((c, col) => {
			if (grid.filled[row][col]) out.push({ col, row: row + 1, x: c[0], y: r[0], w: c[1] - c[0], h: r[1] - r[0] });
		})
	);
	return out;
}

/** The tag written beside a tile: the column as a letter, then the row (0 for a heading) */
export const tagOf = (tile: Pick<Tile, 'col' | 'row'>) => `${'ABCDEFGH'[tile.col]}${tile.row}`;
