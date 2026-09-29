// Draws the picture that shows when a link to the app is shared (static/og.png, 1200×630):
// the mark, the name, the tagline and a small overlapped timetable, in the app's colors.
//   node scripts/make-og.mjs static/og.png
// Needs Playwright (`npm i --no-save playwright`, with its Chromium installed, or CHROME set to
// a Chrome's path), curl, and a network for the fonts, which are the app's own (Zen Maru Gothic,
// Zen Kaku Gothic New).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'static/og.png');

// 0 = nobody has a class, 1 = 自分, 2 = 友だちA, 3 = 友だちB
const GRID = [
	[1, 0, 2, 3, 0],
	[0, 2, 1, 0, 3],
	[3, 1, 0, 0, 2],
	[0, 0, 3, 2, 1]
];
const DAYS = ['月', '火', '水', '木', '金'];
const cells = GRID.flat()
	.map((w) => `<i class="c w${w}">${w === 0 ? '空き' : ''}</i>`)
	.join('');
const days = DAYS.map((d) => `<b>${d}</b>`).join('');

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts">
<style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #F6F2EA; color: #2B2824; font-family: 'Zen Kaku Gothic New', sans-serif; display: flex; align-items: center; padding: 0 84px; gap: 72px; overflow: hidden; }
.text { flex: 1; }
.mark { display: block; margin-bottom: 26px; }
h1 { font-family: 'Zen Maru Gothic', sans-serif; font-weight: 700; font-size: 88px; line-height: 1.15; letter-spacing: 0.02em; white-space: nowrap; }
.tag { margin-top: 22px; font-family: 'Zen Maru Gothic', sans-serif; font-weight: 700; font-size: 33px; white-space: nowrap; }
.sub { margin-top: 18px; font-size: 26px; line-height: 1.6; color: #6B645A; }
.card { width: 440px; padding: 26px; border: 2px solid #E4DDCF; border-radius: 28px; background: #FFFDF8; }
.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.grid b { text-align: center; font-size: 20px; font-weight: 500; color: #6B645A; }
.c { height: 62px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-style: normal; font-weight: 700; font-size: 19px; }
.w0 { border: 2px dashed #B8AE9C; color: #B9502B; }
.w1 { background: #FBE3D6; } .w2 { background: #DCE8F5; } .w3 { background: #E6EFD9; }
</style></head><body>
<div class="text">
<svg class="mark" width="96" height="96" viewBox="0 0 48 48"><rect x="4" y="8" width="26" height="26" rx="7" fill="#D9653B"/><rect x="18" y="14" width="26" height="26" rx="7" fill="#3569A8" style="mix-blend-mode:multiply"/></svg>
<h1>コマあわせ</h1>
<p class="tag">友だちと、時間割を共有しよう。</p>
<p class="sub">重ねると、みんなが空いているコマが<br>すぐわかる。</p>
</div>
<div class="card"><div class="grid">${days}${cells}</div></div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));

// The app's fonts, downloaded next to the page so the picture doesn't depend on Chrome's own
// network access. curl follows the machine's proxy settings.
const FAMILIES = 'family=Zen+Kaku+Gothic+New:wght@500;700&family=Zen+Maru+Gothic:wght@700';
const curl = (...args) => {
	const r = spawnSync('curl', ['-fsS', '-A', 'Mozilla/5.0', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
	if (r.status !== 0) throw new Error(`curl failed: ${r.stderr}`);
	return r.stdout;
};
let css = curl(`https://fonts.googleapis.com/css2?${FAMILIES}&display=block`);
const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
urls.forEach((url, i) => {
	const file = `font${i}.woff2`;
	curl('-o', join(dir, file), url);
	css = css.replaceAll(url, file);
});

const page = join(dir, 'og.html');
writeFileSync(page, html.replace(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`));

// Playwright, for a viewport of exactly 1200×630: `npm i --no-save playwright` first.
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
	const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
	await tab.goto(`file://${page}`);
	await tab.evaluate(() => document.fonts.ready);
	await tab.screenshot({ path: out });
} finally {
	await browser.close();
	rmSync(dir, { recursive: true, force: true });
}
console.log('wrote', out);
