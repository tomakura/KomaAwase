// Renders the video to MP4 (H.264 + AAC, 30fps, 30s) in promo/out/: each frame is a screenshot of
// promo/video/index.html at that time, and the music comes from the same page's OfflineAudioContext.
// Needs Playwright (`npm i --no-save playwright` with its Chromium, or CHROME set to a Chrome's
// path) and FFmpeg (on the PATH, or FFMPEG set to its path).
//   node promo/render.mjs v|h            縦 1080×1920 / 横 1920×1080
//   node promo/render.mjs v audio-only   only promo/out/music.wav
//   node promo/render.mjs v peek 3 10.5  stills at those seconds, as promo/out/v-3.png …
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const [ar = 'v', mode, ...times] = process.argv.slice(2);
const V = ar === 'v';
const [W, H] = V ? [1080, 1920] : [1920, 1080];
const FPS = 30;
const DUR = 30;
const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(pathToFileURL(fileURLToPath(new URL('./video/index.html', import.meta.url))).href + `?render=1&ar=${V ? '9x16' : '16x9'}`);
await page.evaluate(() => window.ready);

if (mode === 'peek') {
	for (const t of times) {
		await page.evaluate((t) => window.seek(Number(t)), t);
		await page.screenshot({ path: `${out}${ar}-${t}.png` });
	}
	await browser.close();
	process.exit(0);
}

const wav = `${out}music.wav`;
writeFileSync(wav, Buffer.from(await page.evaluate(() => window.renderAudio()), 'base64'));
console.log('audio', wav);
if (mode === 'audio-only') {
	await browser.close();
	process.exit(0);
}

const mp4 = `${out}komaawase-30s-${V ? '9x16' : '16x9'}.mp4`;
const ff = spawn(FFMPEG, [
	'-y', '-loglevel', 'error',
	'-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
	'-i', wav,
	'-map', '0:v', '-map', '1:a',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
	'-c:a', 'aac', '-b:a', '256k', '-t', String(DUR),
	'-movflags', '+faststart', mp4
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < DUR * FPS; i++) {
	await page.evaluate((t) => window.seek(t), i / FPS);
	const png = await page.screenshot({ type: 'png' });
	if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
	if (i % 150 === 0) console.log(`frame ${i}/${DUR * FPS}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done', mp4);
