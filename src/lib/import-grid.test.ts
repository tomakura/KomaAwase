import { describe, expect, it } from 'vitest';
import { findGrid, tagOf, tiles, type Pixels } from './import-grid';

type Colour = [number, number, number];

function canvas(width: number, height: number, background: Colour): Pixels {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) data.set([...background, 255], i);
	return { data, width, height };
}

function rect(img: Pixels, x: number, y: number, w: number, h: number, colour: Colour) {
	for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.data.set([...colour, 255], (j * img.width + i) * 4);
}

const LINE: Colour = [70, 70, 70];
const DARK: Colour = [30, 32, 36];
const INK: Colour = [235, 235, 235];

/** Dark cells cut by grid lines, like the student portal: 5 columns of 100px, 4 rows of 60px */
function lined(filled: [number, number][]) {
	const img = canvas(560, 300, DARK);
	for (let c = 0; c <= 5; c++) rect(img, 40 + c * 100, 20, 2, 240, LINE);
	for (let r = 0; r <= 4; r++) rect(img, 40, 20 + r * 60, 502, 2, LINE);
	for (const [c, r] of filled) rect(img, 40 + c * 100 + 10, 20 + r * 60 + 10, 60, 12, INK);
	return img;
}

/** Light cards with gaps between them, like a phone app: empty ones white, filled ones tinted */
function cards(filled: [number, number][]) {
	const bg: Colour = [240, 244, 252];
	const img = canvas(620, 460, bg);
	for (let r = 0; r < 5; r++)
		for (let c = 0; c < 5; c++) {
			const isFilled = filled.some(([fc, fr]) => fc === c && fr === r);
			rect(img, 60 + c * 110, 100 + r * 70, 100, 60, isFilled ? [160, 232, 216] : [255, 255, 255]);
			if (isFilled) rect(img, 60 + c * 110 + 10, 100 + r * 70 + 20, 60, 8, [40, 40, 40]);
		}
	return img;
}


// The student portal as it comes out of a screenshot that was scaled down: the lines are one or
// two pixels wide and no two are quite the same grey, so no single colour finds them all. The
// table has 6 columns and 6 periods with a lunch bar after the second, and a title above it.
function scaled() {
	const greys = [110, 46, 78, 104, 50, 92, 58, 84];
	const colW = 100;
	const rowH = 50;
	const bar = 14;
	// Rows start at these offsets: period 1, 2, the lunch bar, then 3 to 6
	const tops = [0, rowH, rowH * 2, rowH * 2 + bar, rowH * 3 + bar, rowH * 4 + bar, rowH * 5 + bar];
	const bottom = rowH * 6 + bar;
	const left = 30;
	const top = 80;
	const img = canvas(700, 460, DARK);
	for (let c = 0; c <= 6; c++) {
		const g = greys[c % greys.length];
		rect(img, left + c * colW, top - 20, c % 2 ? 1 : 2, bottom + 20, [g, g + 2, g + 3]);
	}
	tops.forEach((t, i) => {
		const g = greys[(i + 3) % greys.length];
		rect(img, left, top + t, colW * 6, i % 2 ? 1 : 2, [g, g + 2, g + 3]);
	});
	rect(img, left, top + bottom, colW * 6, 1, [70, 72, 74]);
	// the weekday headings sit in the 20px band above the first row, a title above that
	rect(img, left + 8, 20, 120, 10, INK);
	for (let c = 0; c < 6; c++) rect(img, left + c * colW + 30, top - 14, 40, 8, INK);
	// one class in Friday's column at period 6, one in Monday's at period 1
	rect(img, left + 4 * colW + 10, top + tops[6] + 10, 60, 12, INK);
	rect(img, left + 10, top + 10, 60, 12, INK);
	return img;
}

describe('findGrid', () => {
	it('finds cells cut by grid lines, and which ones have something written', () => {
		const grid = findGrid(lined([[0, 2], [1, 0], [4, 3]]))!;
		expect(grid.cols).toEqual([[42, 140], [142, 240], [242, 340], [342, 440], [442, 540]]);
		expect(grid.rows).toEqual([[22, 80], [82, 140], [142, 200], [202, 260]]);
		expect(grid.filled.map((row) => row.map(Number))).toEqual([
			[0, 1, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[1, 0, 0, 0, 0],
			[0, 0, 0, 0, 1]
		]);
	});

	it('finds cards separated by gaps, including a card with no text but a colour of its own', () => {
		const grid = findGrid(cards([[0, 2], [1, 2], [3, 4]]))!;
		expect(grid.cols).toHaveLength(5);
		expect(grid.rows).toHaveLength(5);
		expect(tiles(grid).filter((t) => t.row > 0).map(tagOf)).toEqual(['A3', 'B3', 'D5']);
	});

	it('tags the filled cells in reading order, after a heading for each column when there is room above', () => {
		const grid = findGrid(cards([[2, 0], [0, 1]]))!;
		expect(tiles(grid).map(tagOf)).toEqual(['A0', 'B0', 'C0', 'D0', 'E0', 'C1', 'A2']);
		const heading = tiles(grid)[0];
		expect(heading).toMatchObject({ col: 0, row: 0, x: grid.cols[0][0], w: grid.cols[0][1] - grid.cols[0][0] });
		expect(heading.y + heading.h).toBe(grid.rows[0][0]);
	});

	it('finds every column and period when the lines are of different greys, with a lunch bar between periods', () => {
		const grid = findGrid(scaled())!;
		expect(grid.cols).toHaveLength(6);
		expect(grid.rows).toHaveLength(6);
		expect(tiles(grid).filter((t) => t.row > 0).map(tagOf)).toEqual(['A1', 'E6']);
	});

	it('does not take the title bar above a table for a period, even when it is as tall as one', () => {
		const img = canvas(600, 700, DARK);
		// Lines 100px apart, every row 100px tall; the bar above them is 100px tall too
		for (let c = 0; c <= 5; c++) rect(img, 50 + c * 100, 100, 2, 500, LINE);
		for (let r = 0; r <= 5; r++) rect(img, 50, 100 + r * 100, 502, 2, LINE);
		rect(img, 60, 30, 200, 20, INK);
		rect(img, 60 + 4 * 100, 100 + 4 * 100 + 30, 60, 12, INK);
		const grid = findGrid(img)!;
		expect(grid.rows).toHaveLength(5);
		expect(tiles(grid).filter((t) => t.row > 0).map(tagOf)).toEqual(['E5']);
	});

	it('takes the heading band from the lines above the first row, not a fixed height', () => {
		const grid = findGrid(scaled())!;
		const heading = tiles(grid)[0];
		expect(heading).toMatchObject({ col: 0, row: 0 });
		// The title written above the band stays out of it
		expect(heading.h).toBeLessThanOrEqual(24);
		expect(heading.y + heading.h).toBe(grid.rows[0][0]);
	});

	it('leaves a title that sits right above the headings out of the heading band', () => {
		const img = cards([[1, 1]]);
		// The page title at 72-80, the weekday headings at 88-96: the band above the first row is 70-100
		rect(img, 60, 72, 200, 8, [40, 40, 40]);
		for (let c = 0; c < 5; c++) rect(img, 60 + c * 110 + 30, 88, 40, 8, [40, 40, 40]);
		const heading = tiles(findGrid(img)!)[0];
		expect(heading.y).toBeGreaterThan(80);
		expect(heading.y).toBeLessThanOrEqual(88);
		expect(heading.y + heading.h).toBe(100);
	});

	it('gives up on what is not a table', () => {
		expect(findGrid(canvas(400, 400, [255, 255, 255]))).toBeNull();
		expect(findGrid(canvas(50, 50, [0, 0, 0]))).toBeNull();
		// A table with nothing in it has nothing to send
		expect(findGrid(cards([]))).toBeNull();
	});

	it('does not count columns when a line is missing: the cells after it would be in the wrong column', () => {
		const img = lined([[0, 0]]);
		// Wipe the third vertical line, so two columns look like one wide cell
		rect(img, 240, 20, 2, 240, DARK);
		expect(findGrid(img)).toBeNull();
	});
});
