/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Keeps the app opening without a connection: the built files are cached up front, and pages
// are fetched from the network first, falling back to the last copy seen on this device. The
// page copies hold the user's timetable, so signing out clears them (see PAGE_CACHE_PREFIX).
import { build, files, version } from '$service-worker';
import { PAGE_CACHE_PREFIX } from '$lib/offline';

const sw = self as unknown as ServiceWorkerGlobalScope;
const ASSETS = `assets-${version}`;
// Per version, so an old page never points at files a new version dropped
const PAGES = `${PAGE_CACHE_PREFIX}${version}`;
const precached = new Set([...build, ...files]);

// Never kept: sign-in, anything that changes data, files, and the Worker's own routes
const NETWORK_ONLY = /^\/(login|logout|auth|api|internal|verify|import\/upload|courses\/[^/]+\/files)(\/|$)/;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(ASSETS)
			.then((cache) => cache.addAll([...precached]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== ASSETS && k !== PAGES).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

const OFFLINE = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>オフライン · コマあわせ</title><body style="margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;background:#f6f2ea;color:#2b2824;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box"><p style="line-height:1.8">インターネットにつながっていません。<br>電波のよいところで、もう一度開いてください。</p></body></html>`;

async function networkFirst(request: Request) {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic' && !response.redirected) {
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = (await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true }));
		if (cached) return cached;
		if (request.mode === 'navigate') {
			return new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
		}
		throw new Error('offline');
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin || NETWORK_ONLY.test(url.pathname)) return;

	if (precached.has(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}
	if (request.mode === 'navigate' || url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request));
	}
});
