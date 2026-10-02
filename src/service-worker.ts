/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Keeps the app opening without a connection: the built files are cached up front (fonts as
// they are used), and pages are fetched from the network first, falling back to the last copy
// seen on this device. The fallback comes when the network fails and also when it is too slow
// (SLOW_MS), since a bad connection often doesn't fail, it just never answers. A page that is
// being awaited shows a spinner instead of nothing (see waiting). The page copies hold the
// user's timetable, so signing out clears them (see PAGE_CACHE_PREFIX). A copy goes when the
// server says the page is gone or no longer the user's, and copies of pages that show other
// people are only shown for a few days (copyMaxAge).
import { build, files, version } from '$service-worker';
import { PAGE_CACHE_PREFIX, SAVED_AT_HEADER, SYNC_HEADER, copyMaxAge, neverKept } from '$lib/offline';
import { SECURITY_HEADERS, cspHeader, nonceOf } from '$lib/security';
import { leaveScript, renonce, stampHtml, themeOf, waitDone, waitShell } from '$lib/wait';

const sw = self as unknown as ServiceWorkerGlobalScope;
const ASSETS = `assets-${version}`;
// Per version, so an old page never points at files a new version dropped
const PAGES = `${PAGE_CACHE_PREFIX}${version}`;
// The fonts come in hundreds of small files split by character, most of which no page uses:
// they are kept as pages ask for them instead (see keepFont)
const isFont = (path: string) => path.endsWith('.woff2');
const precached = new Set([...build, ...files].filter((path) => !isFont(path)));
const fonts = new Set(build.filter(isFont));
// How long the network gets to answer before a saved copy is shown instead
const SLOW_MS = 4000;
// A page not answered within this long is awaited behind a spinner
const GRACE_MS = 700;
const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(resolve, ms, null));

// What the server answers when a page isn't the user's to see (any more), or not there
const REFUSED = new Set([401, 403, 404, 410]);

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

const OFFLINE = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>オフライン · コマあわせ</title><style>body{margin:0;min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:#f6f2ea;color:#2b2824;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box}p{margin:0;font-size:15px;line-height:1.8;text-wrap:balance}div{display:flex;gap:12px}button,a{min-height:48px;box-sizing:border-box;display:flex;align-items:center;padding:0 20px;border:1px solid currentColor;border-radius:14px;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#1c1a18;color:#eee7da}}</style><body><p>インターネットにつながっていません。<br>電波のよいところで、もう一度開いてください。</p><div><a href="">もう一度開く</a><a href="/">時間割へ</a></div>`;

// SvelteKit's data requests say which parts to reload in x-sveltekit-invalidated; the page is
// the same whatever it says, so it's kept under one key. Any other query must match exactly.
function pageKey(request: Request) {
	const url = new URL(request.url);
	url.searchParams.delete('x-sveltekit-invalidated');
	return url.href;
}

// A page's data that says it can't be shown: a redirect (to sign in, say), or a part of it that
// failed with one of the REFUSED statuses (SvelteKit answers those with 200 and says so inside)
function refusedData(body: string) {
	try {
		const message = JSON.parse(body);
		return (
			message?.type === 'redirect' ||
			(Array.isArray(message?.nodes) && message.nodes.some((n: { type?: string; status?: number } | null) => n?.type === 'error' && REFUSED.has(n.status ?? 0)))
		);
	} catch {
		return false;
	}
}

// A copy is kept with the time it was saved, which is passed on when it is shown. An answer
// that refuses the page drops the copy kept of it, so it isn't shown offline afterwards.
async function save(cache: Cache, key: string, response: Response) {
	// Cache-Control isn't read: SvelteKit marks every __data.json no-store (for HTTP caches),
	// and this copy is the app's own, dropped at sign-out. Pages never to keep are neverKept.
	if (response.type !== 'basic') return;
	if (REFUSED.has(response.status) || response.redirected) {
		await cache.delete(key);
		return;
	}
	if (!response.ok) return;
	const headers = new Headers(response.headers);
	headers.set(SAVED_AT_HEADER, String(Date.now()));
	if (new URL(key).pathname.endsWith('/__data.json')) {
		const body = await response.text();
		if (refusedData(body)) await cache.delete(key);
		else await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers }));
		return;
	}
	await cache.put(key, new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}

// The copy kept under the key, unless it is older than its page may be shown (copyMaxAge)
async function copyOf(cache: Cache, key: string) {
	const copy = await cache.match(key);
	if (!copy) return undefined;
	const savedAt = Number(copy.headers.get(SAVED_AT_HEADER));
	if (Date.now() - savedAt <= copyMaxAge(new URL(key).pathname)) return copy;
	await cache.delete(key).catch(() => {});
	return undefined;
}

// A page opened from a copy says so on <html>, with the time it was saved (the page can't read
// the headers of the document it is in)
async function stamp(request: Request, copy: Response) {
	const savedAt = copy.headers.get(SAVED_AT_HEADER);
	if (request.mode !== 'navigate' || !savedAt || !/^\d+$/.test(savedAt) || !copy.headers.get('content-type')?.includes('text/html')) {
		return copy;
	}
	// The text is read already decoded and is longer now
	const headers = new Headers(copy.headers);
	headers.delete('content-length');
	headers.delete('content-encoding');
	return new Response(stampHtml(await copy.text(), savedAt), { status: copy.status, statusText: copy.statusText, headers });
}

// A page that can't be fetched is shown from the copy of the same page under another query, if
// there is one (…/overlay?with=… from …/overlay; the timetable of a term from the timetable): the
// address without the query, but for the parameter SvelteKit asks a data request with
function nearKey(request: Request) {
	const url = new URL(request.url);
	const slash = url.searchParams.get('x-sveltekit-trailing-slash');
	url.search = '';
	if (slash) url.searchParams.set('x-sveltekit-trailing-slash', slash);
	return url.href;
}

function unavailable(request: Request) {
	if (request.mode === 'navigate') {
		return new Response(OFFLINE, { status: 503, headers: { ...SECURITY_HEADERS, 'content-security-policy': cspHeader(), 'content-type': 'text/html; charset=utf-8' } });
	}
	throw new Error('offline');
}

async function networkFirst(event: FetchEvent) {
	const { request } = event;
	const cache = await caches.open(PAGES);
	const key = pageKey(request);
	// Asked before the copy is looked for, so neither waits for the other. It runs on after a
	// copy has been shown, to save the answer for next time.
	let saved: Promise<void> = Promise.resolve();
	const network = fetch(request).then((response) => {
		// A copy that couldn't be kept (no room, say) must not fail the event that shows the page
		saved = save(cache, key, response.clone()).catch(() => {});
		return response;
	});
	event.waitUntil(network.then(() => saved, () => {}));
	const copy = await copyOf(cache, key);
	// Only for when the network fails: a slow answer is waited for, not swapped for another view
	const near = copy ? undefined : await copyOf(cache, nearKey(request));
	try {
		if (request.mode === 'navigate') {
			// A quick answer goes straight through; for a slow one the screen gets a spinner
			const quick = await Promise.race([network, sleep(GRACE_MS)]);
			return quick ?? waiting(event, network, copy, near);
		}
		if (!copy) return await network;
		// With a copy to show, the network gets SLOW_MS to answer
		return (await Promise.race([network, sleep(SLOW_MS)])) ?? (await stamp(request, copy));
	} catch {
		const shown = copy ?? near;
		return shown ? await stamp(request, shown) : unavailable(request);
	}
}

// A page still awaited after GRACE_MS: the answer starts with a spinner (src/lib/wait.ts), which
// is the first thing on screen, and the page follows on the same document. Without this a slow
// connection leaves the screen blank. With a copy to show, the network gets SLOW_MS in all.
// The document goes out before the server's headers are known, so it carries the same
// security headers and policy as the server's pages (src/lib/security.ts), under a nonce of its
// own that the page's scripts are given as they pass (renonce). Its status is always 200: an
// error page still comes in it, as the page that says so.
function waiting(event: FetchEvent, network: Promise<Response>, copy: Response | undefined, near: Response | undefined) {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
	event.waitUntil(follow(event.request, writable, network, copy, near, nonce));
	return new Response(readable, {
		headers: { ...SECURITY_HEADERS, 'content-security-policy': cspHeader(nonce), 'content-type': 'text/html; charset=utf-8' }
	});
}

async function follow(
	request: Request,
	writable: WritableStream<Uint8Array>,
	network: Promise<Response>,
	copy: Response | undefined,
	near: Response | undefined,
	nonce: string
) {
	const out = writable.getWriter();
	const encoder = new TextEncoder();
	const write = (html: string) => out.write(encoder.encode(html));
	try {
		// What is shown if the network gives nothing: the copy of the page, else of its near kin
		const shown = copy ?? near;
		const savedAt = shown?.headers.get(SAVED_AT_HEADER) ?? '';
		const html = shown ? renonce(await shown.text(), nonceOf(shown.headers.get('content-security-policy')), nonce) : '';
		await write(waitShell(themeOf(html), nonce));

		const answer = await (copy ? Promise.race([network, sleep(SLOW_MS - GRACE_MS)]) : network).catch(() => null);
		if (answer?.type === 'opaqueredirect') {
			// A stream can't pass a redirect on (its address isn't readable): ask again to learn it
			const target = await fetch(request.url, { redirect: 'follow' }).then(
				(res) => {
					res.body?.cancel();
					return new URL(res.url).origin === sw.location.origin ? res.url : null;
				},
				() => null
			);
			await write(target ? leaveScript(target, nonce) : OFFLINE);
		} else if (answer?.body) {
			// Read whole to give its scripts the nonce (a tag can be split between two chunks)
			await write(renonce(await answer.text(), nonceOf(answer.headers.get('content-security-policy')), nonce));
		} else {
			await write(shown ? stampHtml(html, savedAt) : OFFLINE);
		}
		await write(waitDone(nonce));
	} catch {
		// The page was left before it came
	} finally {
		await out.close().catch(() => {});
	}
}

// A font file from the cache, or fetched and kept for next time (and for opening offline)
async function keepFont(event: FetchEvent) {
	const cache = await caches.open(ASSETS);
	const cached = await cache.match(event.request);
	if (cached) return cached;
	const response = await fetch(event.request);
	if (response.ok) event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
	return response;
}

// The app refreshing its copies (src/lib/sync.ts): the network's answer or nothing, saved as it
// goes by, so the app can tell whether the server really answered
async function refresh(event: FetchEvent) {
	const { request } = event;
	const cache = await caches.open(PAGES);
	const response = await fetch(request);
	event.waitUntil(save(cache, pageKey(request), response.clone()).catch(() => {}));
	return response;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin || neverKept(url.pathname)) return;

	if (precached.has(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}
	if (fonts.has(url.pathname)) {
		event.respondWith(keepFont(event));
		return;
	}
	const data = url.pathname.endsWith('/__data.json');
	if (request.headers.has(SYNC_HEADER)) {
		if (data || url.pathname === '/') event.respondWith(refresh(event));
		return;
	}
	if (request.mode === 'navigate' || data) {
		event.respondWith(networkFirst(event));
	}
});

// Notifications (see src/lib/server/push.ts): the message says what to show and which page
// to open. Opening focuses a window of the app that is already there when it can.
sw.addEventListener('push', (event) => {
	let message: { title?: string; body?: string; url?: string; tag?: string; badge?: number } = {};
	try {
		message = event.data?.json() ?? {};
	} catch {
		// Not ours to read; show the name so the user still sees something arrived
	}
	// The icon's number, while the app is closed (the page sets it again when opened)
	const badge = typeof message.badge === 'number' && 'setAppBadge' in navigator ? navigator.setAppBadge(message.badge).catch(() => {}) : null;
	event.waitUntil(
		Promise.all([badge, sw.registration.showNotification(message.title ?? 'コマあわせ', {
			body: message.body,
			tag: message.tag,
			icon: '/icons/icon-192.png',
			data: { url: message.url ?? '/' },
			lang: 'ja'
		})])
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	// Only pages of this app, judged after the address is read (\ counts as / there)
	let url = new URL('/', sw.location.origin).href;
	try {
		const target = new URL(String(event.notification.data?.url ?? '/'), sw.location.origin);
		if (target.origin === sw.location.origin) url = target.href;
	} catch {
		// Keep the top page
	}
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
			const open = windows.find((w) => new URL(w.url).origin === sw.location.origin);
			if (open) {
				await open.focus();
				// A window this worker doesn't control yet can't be moved; open a new one then
				const moved = await open.navigate(url).catch(() => null);
				if (moved) return moved;
			}
			return sw.clients.openWindow(url);
		})
	);
});
