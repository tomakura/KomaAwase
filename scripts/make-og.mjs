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

// The コマを重ねる screen with made-up people and classes: their colors (the app's icon
// colors), a class in its people's tints with a stripe down the left, free slots as empty frames.
const ME = { name: '自分', text: '自', color: '#B9502B' };
const AO = { name: 'あお', text: 'あ', color: '#2F5F99' };
const HARU = { name: 'はる', text: 'は', color: '#3E7A4E' };
const DAYS = ['月', '火', '水', '木', '金'];
// [day][period]: title and who, or null when nobody has a class
const CLASSES = [
	[['英語', [ME, AO]], null, ['統計', [HARU]], null],
	[null, ['情報', [ME, AO, HARU]], null, ['体育', [AO]]],
	[['統計', [ME, HARU]], null, ['英語', [HARU]], null],
	[null, ['体育', [ME]], ['情報', [AO]], null],
	[['英語', [HARU]], null, null, ['統計', [ME, AO]]]
];
const bands = (dir, colors) =>
	`linear-gradient(to ${dir}, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`;
const fill = (who) =>
	`${bands('bottom', who.map((w) => w.color))} left / 5px 100% no-repeat, ${bands('right', who.map((w) => `color-mix(in srgb, ${w.color} 28%, #FFFDF8)`))}`;
const icon = (w, size) => `<u class="ic" style="background:${w.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px">${w.text}</u>`;

const chips = [ME, AO, HARU]
	.map((w) => `<span class="chip" style="border-color:${w.color};background:color-mix(in srgb, ${w.color} 16%, #FFFDF8)">${icon(w, 34)}${w.name}</span>`)
	.join('');
const days = DAYS.map((d) => `<b>${d}</b>`).join('');
// Row by row: period 1 to 4 across the five days
const cells = [0, 1, 2, 3]
	.flatMap((p) =>
		CLASSES.map((day) => {
			const c = day[p];
			return c
				? `<div class="c"><span class="t" style="background:${fill(c[1])}"><span>${c[0]}</span><span class="ppl">${c[1].map((w) => icon(w, 18)).join('')}</span></span></div>`
				: '<div class="c free"></div>';
		})
	)
	.join('');

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts">
<style>
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #F6F2EA; color: #2B2824; font-family: 'Zen Kaku Gothic New', sans-serif; display: flex; align-items: center; padding: 0 64px; gap: 56px; overflow: hidden; }
.text { flex: 1; }
.mark { display: block; margin-bottom: 26px; }
h1 { font-family: 'Zen Maru Gothic', sans-serif; font-weight: 700; font-size: 84px; line-height: 1.15; letter-spacing: 0.02em; white-space: nowrap; }
.tag { margin-top: 22px; font-family: 'Zen Maru Gothic', sans-serif; font-weight: 700; font-size: 33px; white-space: nowrap; }
.sub { margin-top: 18px; font-size: 26px; line-height: 1.6; color: #6B645A; }
.card { width: 500px; padding: 22px; border: 2px solid #E4DDCF; border-radius: 28px; background: #F6F2EA; }
.chips { display: flex; gap: 8px; margin-bottom: 14px; }
.chip { display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 16px 0 6px; border: 2px solid; border-radius: 23px; font-size: 20px; font-weight: 700; }
.ic { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #FFFDF8; font-style: normal; text-decoration: none; font-weight: 700; }
.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.grid b { text-align: center; font-size: 18px; font-weight: 500; color: #6B645A; }
.c { height: 78px; padding: 4px; border: 2px solid #ede7da; border-radius: 12px; background: #ede7da; display: block; }
.c.free { border-color: #E4DDCF; background: transparent; }
.t { display: flex; flex-direction: column; gap: 4px; height: 100%; padding: 5px 4px 4px 12px; border-radius: 8px; font-size: 17px; font-weight: 700; line-height: 1.2; }
.ppl { display: flex; gap: 2px; }
.ic { flex-shrink: 0; }
</style></head><body>
<div class="text">
<svg class="mark" width="96" height="96" viewBox="0 0 48 48"><rect x="4" y="8" width="26" height="26" rx="7" fill="#D9653B"/><rect x="18" y="14" width="26" height="26" rx="7" fill="#3569A8" style="mix-blend-mode:multiply"/></svg>
<h1>コマあわせ</h1>
<p class="tag">友だちと、時間割を共有しよう。</p>
<p class="sub">重ねると、みんなが空いているコマが<br>すぐわかる。</p>
</div>
<div class="card"><div class="chips">${chips}</div><div class="grid">${days}${cells}</div></div>
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
