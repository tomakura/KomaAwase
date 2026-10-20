// Screenshots of the real app for the video, saved as promo/video/shots/<name>.webp (780px wide).
// Needs `npm run dev` on port 5173 with the demo data from promo/seed.mjs in the local D1, and
// Playwright (`npm i --no-save playwright` with its Chromium, or CHROME set to a Chrome's path).
//   node promo/capture.mjs [name ...]   (no names = all)
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:5173';
// The session promo/seed.mjs makes for あおい (local only)
const TOKEN = 'demo-promo-session-token-komaawase-000000001';
const OUT = new URL('./video/shots/', import.meta.url);
// A Thursday afternoon in Q3, during period 3, so today's column and the class going on show
const NOW = new Date('2026-10-01T13:25:00+09:00');

const settle = async (page, ms = 900) => {
	await page.waitForLoadState('networkidle').catch(() => {});
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(ms);
};

// name → path, and what to do before the shot. `canvas`: save the export preview itself.
const SHOTS = {
	home: { path: '/' },
	detail: { path: '/', run: async (p) => { await p.getByRole('link', { name: /映像表現/ }).first().click(); await settle(p, 1200); } },
	search: { path: '/courses/search?day=3&period=3' },
	import: { path: '/import' },
	'overlay-bottom': { path: '/overlay?with=dm-yui,dm-sota,dm-rin', run: async (p) => { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(p, 800); } },
	group: { path: '/groups/dm-g-photo' },
	plans: { path: '/plans' },
	export: { path: '/export' },
	'export-story': { path: '/export', canvas: true }
};

const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
// PNG → 780px-wide WebP, drawn in the browser so nothing else needs installing
const toWebp = async (png) => {
	const page = await browser.newPage();
	const url = await page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = 780;
		c.height = Math.round((img.height * 780) / img.width);
		const g = c.getContext('2d');
		g.imageSmoothingQuality = 'high';
		g.drawImage(img, 0, 0, c.width, c.height);
		return c.toDataURL('image/webp', 0.9);
	}, png.toString('base64'));
	await page.close();
	return Buffer.from(url.split(',')[1], 'base64');
};

const only = process.argv.slice(2);
for (const [name, s] of Object.entries(SHOTS)) {
	if (only.length && !only.includes(name)) continue;
	const ctx = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		colorScheme: 'light',
		reducedMotion: 'no-preference',
		locale: 'ja-JP',
		timezoneId: 'Asia/Tokyo',
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
		isMobile: true,
		hasTouch: true
	});
	await ctx.addCookies([{ name: 'session', value: TOKEN, url: BASE }]);
	// The prompt to turn on notifications would cover the screen
	await ctx.addInitScript(() => {
		try {
			localStorage.setItem('koma:notify-prompt', '1');
		} catch {}
	});
	const page = await ctx.newPage();
	await page.clock.setFixedTime(NOW);
	await page.goto(BASE + s.path);
	await settle(page, 1500);
	if (s.run) await s.run(page);
	const png = s.canvas
		? Buffer.from((await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))).split(',')[1], 'base64')
		: await page.screenshot();
	writeFileSync(new URL(`${name}.webp`, OUT), await toWebp(png));
	console.log('shot', name);
	await ctx.close();
}
await browser.close();
