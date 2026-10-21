// Finding the table in a timetable screenshot, so each filled cell can be cut out and sent
// on its own. Asked to read a whole screenshot, both AIs lost count of the columns (a Wednesday
// class came back as Thursday) and nothing said so. Given each cell with a tag beside it, the
// column is decided here and there is nothing left to miscount.
//
// A table is drawn with something running the whole way down or across between its cells: a
// grid line, or the gap between cards. It is one colour, so a column of pixels that is mostly
// that colour is a separator. Which colour it is differs from app to app, so each colour that
// fills most of some column or row is tried, and the one that cuts the most even cells wins.
// Lines that are only a pixel or two wide, in a different grey each (a screenshot that was scaled
// down), are found separately, by how they differ from the cells on both sides of them.

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

/**
 * The spans between separators, without the ones that are much smaller or larger than the usual.
 * `header` is the thin span just before the first
 * cell (the band of weekday headings), when lines draw it.
 */
function cellsBetween(separators: Span[], length: number): { spans: Span[]; header: Span | null } {
	const none = { spans: [], header: null };
	if (!separators.length) return none;
	const edged: Span[] = [...separators];
	if (edged[0][0] > 0) edged.unshift([0, 0]);
	if (edged[edged.length - 1][1] < length) edged.push([length, length]);
	// `open`: a side is the end of the image, not a line
	const all: { span: Span; open: boolean }[] = [];
	for (let i = 0; i + 1 < edged.length; i++) {
		const span: Span = [edged[i][1], edged[i + 1][0]];
		if (span[1] - span[0] >= 8) all.push({ span, open: edged[i][0] === edged[i][1] || edged[i + 1][0] === edged[i + 1][1] });
	}
	const size = ({ span }: { span: Span }) => span[1] - span[0];
	const usual = median(all.filter((c) => !c.open).map(size));
	if (!usual) return none;
	// A cell is between two lines, within 0.6 to 1.6 of the usual size. What touches the end of
	// the image is not taken for one: a margin (a title bar, a status bar) can be any size,
	// the height of a row among them, and one counted as a row moves every period down by one
	const kept = all.filter((c) => !c.open && size(c) >= usual * 0.6 && size(c) <= usual * 1.6);
	if (!kept.length) return none;
	// Between two good cells, a span twice the usual size is two cells whose separator wasn't
	// found, and the cells after it would be counted as the wrong column
	const first = all.indexOf(kept[0]);
	const last = all.indexOf(kept[kept.length - 1]);
	if (all.slice(first, last + 1).some((c) => size(c) > usual * 1.6)) return none;
	// Past the last good cell a wide span is the page around the table (a title, a footer),
	// unless it is exactly whole cells wide: then their separators weren't found, and the
	// cells are cut evenly rather than dropped
	const evenly = (c: { span: Span }): Span[] => {
		const n = Math.round(size(c) / usual);
		if (size(c) <= usual * 1.6 || n < 2 || n > 4 || Math.abs(size(c) / usual - n) > 0.12) return [];
		const w = size(c) / n;
		return Array.from({ length: n }, (_, i) => [Math.round(c.span[0] + i * w), Math.round(c.span[0] + (i + 1) * w)] as Span);
	};
	const spans = [...all.slice(0, first).flatMap(evenly), ...kept.map((c) => c.span), ...all.slice(last + 1).flatMap(evenly)];
	// Separators should be thin next to what they separate
	const gap = median(separators.map(([a, b]) => b - a));
	if (gap * 2.5 > usual) return none;
	const before = all[first - 1];
	const header = before && size(before) >= 10 && size(before) < usual * 0.6 ? before.span : null;
	return { spans, header };
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
	return { cols: cellsBetween(runs(colFlags), width).spans, ...rowsOf(runs(rowFlags), height) };
}

function rowsOf(separators: Span[], height: number) {
	const { spans, header } = cellsBetween(separators, height);
	return { rows: spans, header };
}

// A line a pixel or two wide is brighter (or darker) than the pixels a little to both sides of
// it, whatever its own grey: when a screenshot is scaled down the lines come out in different
// greys, and no one colour finds them all. How far apart the greys must be, how far to look
// for the sides, and how much of the table's height or width a line has to run (the table
// may be only part of the screenshot)
const LINE_CONTRAST = 14;
const LINE_REACH = 3;
const LINE_RUN = 0.3;

function luminance({ data, width, height }: Pixels) {
	const out = new Float32Array(width * height);
	for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
	return out;
}

/** The runs of positions along one axis that have a thin line across most of the other axis */
function thinLines(lum: Float32Array, width: number, height: number, vertical: boolean): Span[] {
	const along = vertical ? height : width;
	const across = vertical ? width : height;
	const samples = steps(along);
	const flags: boolean[] = [];
	for (let k = 0; k < across; k++) {
		let best = 0;
		let run = 0;
		let misses = 0;
		for (const t of samples) {
			const at = (p: number) => (vertical ? lum[t * width + p] : lum[p * width + t]);
			let hit = false;
			if (k >= LINE_REACH && k < across - LINE_REACH) {
				const v = at(k);
				const a = v - at(k - LINE_REACH);
				const b = v - at(k + LINE_REACH);
				hit = a * b > 0 && Math.min(Math.abs(a), Math.abs(b)) >= LINE_CONTRAST;
			}
			if (hit) {
				run++;
				misses = 0;
				best = Math.max(best, run);
			} else if (run && ++misses > 2) {
				run = 0;
				misses = 0;
			}
		}
		flags.push(best / samples.length >= LINE_RUN);
	}
	return runs(flags);
}

function cutByLines(img: Pixels) {
	const lum = luminance(img);
	return {
		cols: cellsBetween(thinLines(lum, img.width, img.height, true), img.width).spans,
		...rowsOf(thinLines(lum, img.width, img.height, false), img.height)
	};
}

/** Whether something is written in the cell, or it is coloured unlike the empty ones */
function look(img: Pixels, col: Span, row: Span): { colour: Colour; written: boolean } {
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

/**
 * The part of the band above the table that the weekday headings fill. A page's own title or a
 * button can sit right above them, and the AI would read that as part of a heading. Rows with
 * something written in them are looked for from the bottom up: the last block of them is the
 * headings, and a blank stretch above it ends the band.
 */
function headingBand(img: Pixels, cols: Span[], band: Span): Span {
	const { data, width } = img;
	const inked = (y: number) =>
		cols.some((c) => {
			let lo = 255;
			let hi = 0;
			for (let x = c[0] + 2; x < c[1] - 2; x += Math.max(1, Math.floor((c[1] - c[0]) / 80))) {
				const i = (y * width + x) * 4;
				const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
				lo = Math.min(lo, l);
				hi = Math.max(hi, l);
			}
			return hi - lo > 40;
		});
	const BLANK = 5;
	let top = band[1];
	let seen = false;
	let blank = 0;
	for (let y = band[1] - 1; y >= band[0]; y--) {
		if (inked(y)) {
			seen = true;
			blank = 0;
			top = y;
		} else if (seen && ++blank >= BLANK) break;
	}
	// A little room around the writing, so the heading isn't cut at the edge
	return seen ? [Math.max(band[0], top - BLANK), band[1]] : band;
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

	type Found = { cols: Span[]; rows: Span[]; header: Span | null };
	const fits = (f: Found) => f.cols.length >= COLS_MIN && f.cols.length <= COLS_MAX && f.rows.length >= ROWS_MIN && f.rows.length <= ROWS_MAX;
	const cells = (f: Found) => f.cols.length * f.rows.length;
	let best: Found | null = null;
	for (const tolerance of TOLERANCES) {
		for (const { colour } of [...candidates.values()].sort((a, b) => b.n - a.n).slice(0, 6)) {
			const found = cut(img, colour, tolerance);
			if (fits(found) && (!best || cells(found) > cells(best))) best = found;
		}
		if (best) break;
	}
	// Lines drawn in several greys (a scaled-down screenshot) are found by what sets them apart
	// from the cells around them, not by their colour
	const lined = cutByLines(img);
	if (fits(lined) && (!best || cells(lined) > cells(best))) best = lined;
	if (!best) return null;

	const { cols, rows } = best;
	const looks = rows.map((row) => cols.map((col) => look(img, col, row)));
	// The empty ones are the most common colour
	const usual = mostCommon(looks.flat().map((l) => l.colour));
	const filled = looks.map((row) =>
		row.map((l) => l.written || Math.max(...l.colour.map((c, i) => Math.abs(c - usual[i]))) > 24)
	);
	if (!filled.flat().some(Boolean)) return null;

	// The headings sit just above the first row: in the band the lines draw there, else in a
	// band about half a row tall
	const firstRow = best.rows[0];
	const band = Math.min(firstRow[0], Math.round((firstRow[1] - firstRow[0]) * 0.5));
	const header = best.header ?? (band >= 12 ? headingBand(img, cols, [firstRow[0] - band, firstRow[0]]) : null);
	return { cols, rows, filled, header };
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
