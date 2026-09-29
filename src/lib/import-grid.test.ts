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
