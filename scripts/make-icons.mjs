// Draws the app icons and favicon.ico from the コマあわせ mark: two rounded squares, the overlap
// multiplied. Run `node scripts/make-icons.mjs static` after changing the mark. No dependencies:
// zlib for PNG, a hand-written ICO header, 4x4 supersampling for smooth edges.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = process.argv[2];
const SHU = [0xd9, 0x65, 0x3b];
const AI = [0x35, 0x69, 0xa8];
const PAPER = [0xf6, 0xf2, 0xea];

// The mark's squares in its 48-unit box
const A = { x: 4, y: 8, w: 26, h: 26, r: 7 };
const B = { x: 18, y: 14, w: 26, h: 26, r: 7 };

function inside(px, py, s) {
	const cx = Math.min(Math.max(px, s.x + s.r), s.x + s.w - s.r);
	const cy = Math.min(Math.max(py, s.y + s.r), s.y + s.h - s.r);
	return (px - cx) ** 2 + (py - cy) ** 2 <= s.r ** 2 && px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;
}

/**
 * size: image size in px. mark: how many px the 48-unit box takes, centered.
 * background: [r,g,b] or null for transparent.
 */
function render(size, mark, background, radius = 0) {
	const data = Buffer.alloc(size * size * 4);
	const scale = 48 / mark;
	const offset = (size - mark) / 2;
	const n = 4;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let r = 0,
				g = 0,
				b = 0,
				a = 0;
			for (let sy = 0; sy < n; sy++) {
				for (let sx = 0; sx < n; sx++) {
					const fx = x + (sx + 0.5) / n;
					const fy = y + (sy + 0.5) / n;
					// Rounded background square, when asked for
					let bgA = 0;
					if (background) {
						const rr = radius;
						const cx = Math.min(Math.max(fx, rr), size - rr);
						const cy = Math.min(Math.max(fy, rr), size - rr);
						bgA = rr === 0 || (fx - cx) ** 2 + (fy - cy) ** 2 <= rr * rr ? 1 : 0;
					}
					const mx = (fx - offset) * scale;
					const my = (fy - offset) * scale;
					const inA = inside(mx, my, A);
					const inB = inside(mx, my, B);
					let color = null;
					if (inA && inB) color = SHU.map((c, i) => Math.round((c * AI[i]) / 255));
					else if (inA) color = SHU;
					else if (inB) {
						// multiply over paper (or over nothing: the plain blue)
						color = background ? AI.map((c, i) => Math.round((c * background[i]) / 255)) : AI;
					}
					if (color) {
						r += color[0];
						g += color[1];
						b += color[2];
						a += 1;
					} else if (bgA) {
						r += background[0];
						g += background[1];
						b += background[2];
						a += 1;
					}
				}
			}
			const i = (y * size + x) * 4;
			const k = n * n;
			if (a) {
				data[i] = Math.round(r / a);
				data[i + 1] = Math.round(g / a);
				data[i + 2] = Math.round(b / a);
			}
			data[i + 3] = Math.round((a / k) * 255);
		}
	}
	return data;
}

function crc32(buf) {
	let c;
	const table = [];
	for (let n = 0; n < 256; n++) {
		c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	let crc = 0xffffffff;
	for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(body.length);
	const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed));
	return Buffer.concat([len, typed, crc]);
}

function png(size, rgba) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

// An ICO holding PNG images (supported everywhere that matters)
function ico(images) {
	const header = Buffer.alloc(6 + images.length * 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, data }, i) => {
		const e = 6 + i * 16;
		header[e] = size >= 256 ? 0 : size;
		header[e + 1] = size >= 256 ? 0 : size;
		header.writeUInt16LE(1, e + 4);
		header.writeUInt16LE(32, e + 6);
		header.writeUInt32LE(data.length, e + 8);
		header.writeUInt32LE(offset, e + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...images.map((i) => i.data)]);
}

mkdirSync(`${out}/icons`, { recursive: true });
// Install icons: the mark on paper. "any" fills most of the square; "maskable" keeps the
// mark inside the 80% safe zone, since launchers crop it to a circle or squircle.
writeFileSync(`${out}/icons/icon-192.png`, png(192, render(192, 150, PAPER, 42)));
writeFileSync(`${out}/icons/icon-512.png`, png(512, render(512, 400, PAPER, 112)));
writeFileSync(`${out}/icons/maskable-512.png`, png(512, render(512, 300, PAPER, 0)));
// iOS rounds the corners itself and wants no transparency
writeFileSync(`${out}/apple-touch-icon.png`, png(180, render(180, 140, PAPER, 0)));
// Browsers that ask for /favicon.ico: the mark alone
const fav = [16, 32, 48].map((size) => ({ size, data: png(size, render(size, size, null)) }));
writeFileSync(`${out}/favicon.ico`, ico(fav));
console.log('written');
