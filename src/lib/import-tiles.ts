// Drawing the cut-out cells of a timetable one under another, each with a pink tag on its left
// (see import-grid.ts). Browser only: it needs canvases.
import { tagOf, tiles, type Grid } from './import-grid';

const TAG_COLOUR = '#ff00c8';
const GAP = 8;

/** The cells of `source` that findGrid found, stacked two across, at most `longest` pixels on the long side */
export function drawTiles(source: HTMLCanvasElement, grid: Grid, longest: number): HTMLCanvasElement | null {
	const list = tiles(grid);
	if (!list.length) return null;
	const tileW = Math.max(...list.map((t) => t.w));
	const tagW = Math.round(tileW * 0.22);
	const slotW = tagW + tileW + GAP;
	const across = 2;

	// Each pair sits in a row as tall as the taller of the two
	const rowHeights: number[] = [];
	list.forEach((t, i) => {
		const r = Math.floor(i / across);
		rowHeights[r] = Math.max(rowHeights[r] ?? 0, t.h);
	});
	const width = slotW * across;
	const height = rowHeights.reduce((sum, h) => sum + h + GAP, 0);

	const scale = Math.min(1, longest / Math.max(width, height));
	const out = document.createElement('canvas');
	out.width = Math.round(width * scale);
	out.height = Math.round(height * scale);
	const ctx = out.getContext('2d');
	if (!ctx) return null;
	ctx.scale(scale, scale);
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, height);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `bold ${Math.round(tagW * 0.5)}px sans-serif`;

	const tops = rowHeights.map((_, r) => rowHeights.slice(0, r).reduce((sum, h) => sum + h + GAP, 0));
	list.forEach((t, i) => {
		const x = (i % across) * slotW;
		const y = tops[Math.floor(i / across)];
		ctx.fillStyle = TAG_COLOUR;
		ctx.fillRect(x, y, tagW, t.h);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(tagOf(t), x + tagW / 2, y + t.h / 2);
		ctx.drawImage(source, t.x, t.y, t.w, t.h, x + tagW, y, t.w, t.h);
	});
	return out;
}
