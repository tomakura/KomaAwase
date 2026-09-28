// Draws a timetable as an image on a canvas, in the browser. Canvas text uses the page's web
// fonts, which an SVG turned into an image couldn't.
import { DAY_NAMES, type WeekPattern } from './courses';

export type ExportOptions = {
	format: 'tall' | 'wide';
	hideRoom: boolean;
	day: boolean;
	period: boolean;
	time: boolean;
	name: boolean;
};

export const DEFAULT_OPTIONS: ExportOptions = {
	format: 'tall',
	hideRoom: true,
	day: true,
	period: true,
	time: false,
	name: true
};

export type ExportCourse = {
	color: string;
	titleParts: string[];
	slots: { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null }[];
};

export type ExportData = {
	title: string; // はるとの時間割
	icon: { hex: string; text: string } | null;
	termLabel: string; // 2026 後期 Q3
	days: number[];
	periods: { number: number; start: string; end: string }[];
	courses: ExportCourse[];
	unscheduled: string[];
};

export const SIZES = { tall: { width: 1080, height: 1920 }, wide: { width: 1920, height: 1080 } } as const;

// The light theme of app.css; shared images always look like paper.
const INK = '#2b2824';
const SOFT = '#4a443c';
const SUB = '#6b645a';
const BG = '#f6f2ea';
const SURFACE = '#fffdf8';
const SLOT = '#ede7da';
export const COLORS: Record<string, string> = {
	red: '#f8dcdc',
	orange: '#fbe3d6',
	yellow: '#fff0c7',
	lime: '#eef2cf',
	green: '#e6efd9',
	mint: '#d8eee8',
	blue: '#dce8f5',
	indigo: '#e0e1f4',
	purple: '#efe3f3',
	gray: '#ede7da'
};

const DISPLAY = '"Zen Maru Gothic", sans-serif';
const BODY = '"Zen Kaku Gothic New", sans-serif';

type Box = { x: number; y: number; w: number; h: number };

/**
 * Where everything goes. The period and day labels take only the room their text needs,
 * so the slots stay as large as possible (the mock's labels were too wide).
 */
export function layout(data: ExportData, o: ExportOptions) {
	const { width, height } = SIZES[o.format];
	const tall = o.format === 'tall';
	const pad = tall ? 60 : 44;
	const headerH = o.name || tall ? (tall ? 84 : 64) : 44;
	const footerH = tall ? 72 + (data.unscheduled.length ? 64 : 0) : 0;
	const gap = tall ? 10 : 8;

	const labelW = o.time ? (tall ? 92 : 84) : o.period ? (tall ? 40 : 36) : 0;
	const dayH = o.day ? (tall ? 44 : 38) : 0;

	const grid: Box = {
		x: pad,
		y: pad + headerH + (tall ? 20 : 14),
		w: width - pad * 2,
		h: height - pad * 2 - headerH - (tall ? 20 : 14) - footerH
	};
	const cols = Math.max(data.days.length, 1);
	const rows = Math.max(data.periods.length, 1);
	const cellsX = grid.x + (labelW ? labelW + gap : 0);
	const cellsY = grid.y + (dayH ? dayH + gap : 0);
	const cellW = (grid.x + grid.w - cellsX - gap * (cols - 1)) / cols;
	const cellH = (grid.y + grid.h - cellsY - gap * (rows - 1)) / rows;

	return {
		width,
		height,
		pad,
		tall,
		headerH,
		footerH,
		gap,
		labelW,
		dayH,
		grid,
		cell: (col: number, row: number, span = 1): Box => ({
			x: cellsX + col * (cellW + gap),
			y: cellsY + row * (cellH + gap),
			w: cellW,
			h: cellH * span + gap * (span - 1)
		}),
		dayBox: (col: number): Box => ({ x: cellsX + col * (cellW + gap), y: grid.y, w: cellW, h: dayH }),
		labelBox: (row: number): Box => ({ x: grid.x, y: cellsY + row * (cellH + gap), w: labelW, h: cellH }),
		cellW,
		cellH
	};
}

function roundRect(ctx: CanvasRenderingContext2D, b: Box, r: number, fill: string) {
	ctx.beginPath();
	ctx.roundRect(b.x, b.y, b.w, b.h, r);
	ctx.fillStyle = fill;
	ctx.fill();
}

function text(
	ctx: CanvasRenderingContext2D,
	value: string,
	x: number,
	y: number,
	font: string,
	color: string,
	align: CanvasTextAlign = 'left',
	baseline: CanvasTextBaseline = 'alphabetic'
) {
	ctx.font = font;
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = baseline;
	ctx.fillText(value, x, y);
}

const NO_LINE_START = /^[ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ、。，．）」』】〕〉》！？・：；]/u;

/**
 * Lines for a title: words (from titleParts) are kept whole where they fit, a word
 * longer than a line is broken anywhere, and what doesn't fit ends in "…".
 */
export function wrap(measure: (s: string) => number, parts: string[], maxWidth: number, maxLines: number) {
	const lines: string[] = [];
	let line = '';
	const push = (piece: string) => {
		if (!line || measure(line + piece) <= maxWidth) {
			line += piece;
			return;
		}
		// ー, small kana and closing marks never start a line: the characters before go along.
		const chars = [...line];
		if (NO_LINE_START.test(piece) && chars.length > 1) {
			let cut = chars.length - 1;
			while (cut > 1 && NO_LINE_START.test(chars[cut])) cut--;
			lines.push(chars.slice(0, cut).join(''));
			line = chars.slice(cut).join('') + piece;
			return;
		}
		lines.push(line);
		line = piece;
	};
	for (const part of parts) {
		if (measure(part) <= maxWidth) {
			push(part);
			continue;
		}
		// Like CSS: a word too long for any line starts on a new one, then breaks anywhere.
		if (line) {
			lines.push(line);
			line = '';
		}
		for (const ch of part) push(ch);
	}
	if (line) lines.push(line);
	if (lines.length <= maxLines) return lines;
	const kept = lines.slice(0, maxLines);
	let last = kept[maxLines - 1];
	while (last && measure(`${last}…`) > maxWidth) last = [...last].slice(0, -1).join('');
	kept[maxLines - 1] = `${last}…`;
	return kept;
}

/** The text if it fits in `maxWidth`, else as much as fits followed by "…" */
export function fitLabel(measure: (s: string) => number, label: string, maxWidth: number) {
	if (measure(label) <= maxWidth) return label;
	const chars = [...label];
	while (chars.length > 1 && measure(`${chars.join('')}…`) > maxWidth) chars.pop();
	return `${chars.join('')}…`;
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
	const s = size / 48;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	roundRect(ctx, { x: 4, y: 8, w: 26, h: 26 }, 7, '#d9653b');
	ctx.globalCompositeOperation = 'multiply';
	roundRect(ctx, { x: 18, y: 14, w: 26, h: 26 }, 7, '#3569a8');
	ctx.restore();
}

// 「コマあわせ で作成」 in a paper-colored tag, right-aligned at `right`
function drawBadge(ctx: CanvasRenderingContext2D, right: number, centerY: number, scale: number) {
	const font = `700 ${Math.round(22 * scale)}px ${DISPLAY}`;
	ctx.font = font;
	const label = 'コマあわせ で作成';
	const logo = 30 * scale;
	const padX = 14 * scale;
	const w = padX * 2 + logo + 8 * scale + ctx.measureText(label).width;
	const h = 46 * scale;
	const box = { x: right - w, y: centerY - h / 2, w, h };
	roundRect(ctx, box, 12 * scale, BG);
	drawLogo(ctx, box.x + padX, centerY - logo / 2, logo);
	text(ctx, label, box.x + padX + logo + 8 * scale, centerY, font, SOFT, 'left', 'middle');
}

const time = (t: string) => t.replace(/^0/, '');

export function drawTimetable(ctx: CanvasRenderingContext2D, data: ExportData, o: ExportOptions) {
	const L = layout(data, o);
	const s = L.tall ? 1 : 0.9;
	ctx.clearRect(0, 0, L.width, L.height);
	roundRect(ctx, { x: 0, y: 0, w: L.width, h: L.height }, 0, SURFACE);

	// Header: icon and name on the left, the term on the right (and the tag, when wide)
	const headY = L.pad + L.headerH / 2;
	let right = L.width - L.pad;
	if (!L.tall) {
		drawBadge(ctx, right, headY, 1);
		ctx.font = `700 22px ${DISPLAY}`;
		right -= ctx.measureText('コマあわせ で作成').width + 80;
	}
	text(ctx, data.termLabel, right, headY, `500 ${Math.round(28 * s)}px ${BODY}`, SUB, 'right', 'middle');
	if (o.name) {
		let x = L.pad;
		if (data.icon) {
			const r = 28 * s;
			ctx.beginPath();
			ctx.arc(x + r, headY, r, 0, Math.PI * 2);
			ctx.fillStyle = data.icon.hex;
			ctx.fill();
			const iconFont = `700 ${Math.round(r * (data.icon.text.length > 1 ? 0.8 : 1))}px ${BODY}`;
			text(ctx, data.icon.text, x + r, headY + 1, iconFont, '#fffdf8', 'center', 'middle');
			x += r * 2 + 16 * s;
		}
		text(ctx, data.title, x, headY, `700 ${Math.round(38 * s)}px ${DISPLAY}`, INK, 'left', 'middle');
	}

	// Day names over the columns
	if (L.dayH) {
		data.days.forEach((d, i) => {
			const b = L.dayBox(i);
			text(ctx, DAY_NAMES[d], b.x + b.w / 2, b.y + b.h / 2, `700 ${Math.round(28 * s)}px ${BODY}`, SOFT, 'center', 'middle');
		});
	}

	// Period numbers and times, in a narrow column
	if (L.labelW) {
		data.periods.forEach((p, i) => {
			const b = L.labelBox(i);
			let y = b.y + 8;
			if (o.period) {
				text(ctx, String(p.number), b.x + b.w / 2, y, `700 ${Math.round(30 * s)}px ${DISPLAY}`, INK, 'center', 'top');
				y += 36 * s;
			}
			if (o.time) {
				const small = `500 ${Math.round(20 * s)}px ${BODY}`;
				text(ctx, time(p.start), b.x + b.w / 2, y, small, SOFT, 'center', 'top');
				text(ctx, time(p.end), b.x + b.w / 2, y + 24 * s, small, SUB, 'center', 'top');
			}
		});
	}

	// Empty slots, then the courses over them
	const radius = L.tall ? 16 : 12;
	data.periods.forEach((_, r) => data.days.forEach((__, c) => roundRect(ctx, L.cell(c, r), radius, SLOT)));

	// Sized by the slot's width and height, so wide images with short slots still fit two lines
	const titleSize = Math.round(Math.max(16, Math.min(34, L.cellW * 0.15, L.cellH * 0.2)));
	const roomSize = Math.round(titleSize * 0.78);
	const lineH = titleSize * 1.28;
	const inner = L.tall ? 10 : 8;
	for (const course of data.courses) {
		for (const slot of course.slots) {
			const row = data.periods.findIndex((p) => p.number === slot.period);
			const col = data.days.indexOf(slot.weekday);
			if (row < 0 || col < 0) continue;
			const span = Math.min(slot.span, data.periods.length - row);
			const b = L.cell(col, row, span);
			roundRect(ctx, b, radius, COLORS[course.color] ?? COLORS.gray);

			// Alternate weeks show even with rooms hidden: 「奇 B-203」, or 「奇数週」 alone
			const week = slot.week === 'odd' ? '奇' : slot.week === 'even' ? '偶' : null;
			const shownRoom = o.hideRoom ? null : slot.room;
			const room = week && shownRoom ? `${week} ${shownRoom}` : week ? `${week}数週` : shownRoom;
			const roomH = room ? roomSize + 12 : 0;
			const maxLines = Math.max(1, Math.floor((b.h - inner * 2 - (room ? roomH + 6 : 0)) / lineH));
			ctx.font = `700 ${titleSize}px ${BODY}`;
			const lines = wrap((v) => ctx.measureText(v).width, course.titleParts, b.w - inner * 2, maxLines);
			lines.forEach((line, i) => text(ctx, line, b.x + inner, b.y + inner + i * lineH, ctx.font, INK, 'left', 'top'));

			if (room) {
				ctx.font = `500 ${roomSize}px ${BODY}`;
				const label = fitLabel((v) => ctx.measureText(v).width, room, b.w - inner * 2 - 16);
				const w = Math.min(b.w - inner * 2, ctx.measureText(label).width + 16);
				const pill = { x: b.x + (b.w - w) / 2, y: b.y + b.h - inner - roomH, w, h: roomH };
				roundRect(ctx, pill, 8, SURFACE);
				text(ctx, label, pill.x + w / 2, pill.y + roomH / 2 + 1, ctx.font, INK, 'center', 'middle');
			}
		}
	}

	// Tall images: courses without a slot, then the tag in the corner
	if (L.tall) {
		let y = L.height - L.pad - 46;
		if (data.unscheduled.length) {
			const font = `500 26px ${BODY}`;
			ctx.font = font;
			let label = `曜日・時限なし：${data.unscheduled.join('・')}`;
			while (label.length > 10 && ctx.measureText(label).width > L.width - L.pad * 2) label = label.slice(0, -1);
			text(ctx, label, L.pad, y - 58, font, SOFT, 'left', 'middle');
		}
		drawBadge(ctx, L.width - L.pad, y + 10, 1);
	}
}

/** Loads the glyphs the image needs; canvas text doesn't wait for web fonts. */
export async function loadFonts(data: ExportData) {
	if (!('fonts' in document)) return;
	const all = [
		data.title,
		data.termLabel,
		data.icon?.text ?? '',
		...data.days.map((d) => DAY_NAMES[d]),
		...data.courses.flatMap((c) => [...c.titleParts, ...c.slots.map((s) => s.room ?? '')]),
		...data.unscheduled,
		'曜日・時限なし：…0123456789:',
		'コマあわせ で作成'
	].join('');
	await Promise.all([
		document.fonts.load(`700 30px ${DISPLAY}`, `${data.title}コマあわせ で作成0123456789`),
		document.fonts.load(`500 30px ${BODY}`, all),
		document.fonts.load(`700 30px ${BODY}`, all)
	]);
}
