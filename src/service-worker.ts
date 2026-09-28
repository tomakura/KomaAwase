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

// Never kept: sign-in, anything that changes data, files, the Worker's own routes, and the
// admin page (other people's reports and feedback)
const NETWORK_ONLY = /^\/(login|logout|auth|api|internal|verify|admin|import\/upload|courses\/[^/]+\/files)(\/|$)/;

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

// SvelteKit's data requests say which parts to reload in x-sveltekit-invalidated; the page is
// the same whatever it says, so it's kept under one key. Any other query must match exactly.
function pageKey(request: Request) {
	const url = new URL(request.url);
	url.searchParams.delete('x-sveltekit-invalidated');
	return url.href;
}

async function networkFirst(request: Request) {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		// Cache-Control isn't read: SvelteKit marks every __data.json no-store (for HTTP caches),
		// and this copy is the app's own, dropped at sign-out. Pages never to keep are NETWORK_ONLY.
		if (response.ok && response.type === 'basic' && !response.redirected) {
			cache.put(pageKey(request), response.clone());
		}
		return response;
	} catch {
		const cached = await cache.match(pageKey(request));
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

// Notifications (see src/lib/server/push.ts): the message says what to show and which page
// to open. Opening focuses a window of the app that is already there when it can.
sw.addEventListener('push', (event) => {
	let message: { title?: string; body?: string; url?: string; tag?: string } = {};
	try {
		message = event.data?.json() ?? {};
	} catch {
		// Not ours to read; show the name so the user still sees something arrived
	}
	event.waitUntil(
		sw.registration.showNotification(message.title ?? 'コマあわせ', {
			body: message.body,
			tag: message.tag,
			icon: '/icons/icon-192.png',
			data: { url: message.url ?? '/' },
			lang: 'ja'
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = String(event.notification.data?.url ?? '/');
	// Only pages of this app
	const url = new URL(path.startsWith('/') && !path.startsWith('//') ? path : '/', sw.location.origin).href;
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
			const open = windows.find((w) => new URL(w.url).origin === sw.location.origin);
			if (open) {
				await open.focus();
				return open.navigate(url);
			}
			return sw.clients.openWindow(url);
		})
	);
});
