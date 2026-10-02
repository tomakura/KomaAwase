// What the service worker sends while a page is awaited from a slow network: a spinner in the
// middle of the screen, then the page itself after it (src/service-worker.ts). The page is
// written to the same document, which is how a browser reads a stream: the second <!doctype>
// is ignored, and the second <html>, <head> and <body> add their attributes to the ones there
// (so data-theme and data-cached-at arrive) and keep their contents where they are.
// Nothing here may touch the page: it runs in the service worker. The scripts carry the nonce
// the service worker sent its policy with (see src/lib/security.ts), as the page's own do.
import { CACHED_AT_ATTRIBUTE } from './offline';

export const WAIT_ID = 'koma-wait';

export type Theme = 'system' | 'light' | 'dark';

// The colors of the app's own themes (src/app.css): the page behind, the ring, and its turning part
const COLORS = {
	light: { bg: '#f6f2ea', line: '#e4ddcf', accent: '#d9653b' },
	dark: { bg: '#1c1a18', line: '#3a3531', accent: '#e27a52' }
};

const vars = (c: (typeof COLORS)['light']) => `--w-bg:${c.bg};--w-line:${c.line};--w-accent:${c.accent}`;

/** The theme a page says it has (data-theme on <html>, set from the user's setting) */
export function themeOf(html: string): Theme {
	const tag = html.match(/<html[^>]*>/)?.[0] ?? '';
	const theme = tag.match(/data-theme="(system|light|dark)"/)?.[1];
	return (theme as Theme | undefined) ?? 'system';
}

/** The start of the stream: a spinner over the whole screen, in the colors of the user's theme */
export function waitShell(theme: Theme, nonce: string) {
	const colors =
		theme === 'dark'
			? `#${WAIT_ID}{${vars(COLORS.dark)}}`
			: theme === 'light'
				? `#${WAIT_ID}{${vars(COLORS.light)}}`
				: `#${WAIT_ID}{${vars(COLORS.light)}}@media (prefers-color-scheme:dark){#${WAIT_ID}{${vars(COLORS.dark)}}}`;
	return (
		'<!doctype html><html lang="ja"><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width, initial-scale=1">' +
		`<style>${colors}` +
		`#${WAIT_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:var(--w-bg)}` +
		`#${WAIT_ID} i{width:40px;height:40px;box-sizing:border-box;border:4px solid var(--w-line);border-top-color:var(--w-accent);border-radius:50%;animation:koma-spin .9s linear infinite}` +
		'@keyframes koma-spin{to{transform:rotate(360deg)}}' +
		`@media (prefers-reduced-motion:reduce){#${WAIT_ID} i{animation:koma-pulse 1.6s ease-in-out infinite}@keyframes koma-pulse{50%{opacity:.35}}}` +
		`</style><div id="${WAIT_ID}" role="status" aria-label="読み込み中"><i></i></div>` +
		// If the rest never comes whole, the half that did is better than a spinner for ever
		`<script nonce="${nonce}">setTimeout(function(){var e=document.getElementById("${WAIT_ID}");e&&e.remove()},30000)</script>`
	);
}

/** The end of the stream, once the page is all there: the spinner goes (its stylesheets have loaded by now) */
export const waitDone = (nonce: string) => `<script nonce="${nonce}">var e=document.getElementById("${WAIT_ID}");e&&e.remove()</script>`;

/** For an answer that is a redirect, which a stream can't pass on: go where it goes */
export function leaveScript(url: string, nonce: string) {
	// "</script>" or "<!--" in an address must not end the script
	return `<script nonce="${nonce}">location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script>`;
}

/** A saved page, marked with the time it was saved (see CACHED_AT_ATTRIBUTE) */
export function stampHtml(html: string, savedAt: string) {
	return /^\d+$/.test(savedAt) ? html.replace('<html', `<html ${CACHED_AT_ATTRIBUTE}="${savedAt}"`) : html;
}

/**
 * A page from the server (or a saved copy of one), for the document the service worker
 * started: its scripts carry the server's nonce, which the document's policy doesn't know,
 * so they are given the service worker's. Only tags carrying the server's nonce get it, and
 * that nonce was never in anything a page could have been made to show.
 */
export function renonce(html: string, from: string | null, to: string) {
	return from ? html.replaceAll(`nonce="${from}"`, `nonce="${to}"`) : html;
}
