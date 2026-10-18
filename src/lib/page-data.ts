// Going back (the browser's button, or a swipe) shows a page as it was left, at once, and
// updates it if the server has something new. Without this SvelteKit asks the server for the
// page's data again and shows nothing until it answers.
//
// SvelteKit reads window.fetch each time it needs a page's data (…/__data.json), so a stand-in
// can hand back the copy kept from the last visit. Only a navigation through history uses a
// copy; every other visit asks the server, and any request that changes something drops all
// the copies. They live in memory, so a reload or signing out clears them. Pages the service
// worker never keeps (the admin pages, sign-in, …: neverKept) get no copy here either, so
// they are always asked for and never shown without the server's say.
import { SAVED_AT_HEADER, neverKept } from './offline';

const SUFFIX = '/__data.json';
const MAX_COPIES = 24;
const REDIRECT = '"type":"redirect"';

type Copy = { body: string; type: string };

const trimmed = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

// Some pages get the server's clock as `now` (the timetable, the overlay). It differs on every
// request and pages read the day and the hour from it, so a copy is shown with the device's
// time instead, and two answers that differ only there are the same. The data is JSON whose
// first item lists where each value sits; `now` points at the slot holding the time. Anything
// that isn't in this shape is left as it came.
function withNow(body: string, now: number) {
	try {
		const message = JSON.parse(body);
		for (const node of message.nodes) {
			const data = node?.type === 'data' ? node.data : null;
			const slot = Array.isArray(data) ? data[0]?.now : undefined;
			if (typeof slot === 'number' && typeof data[slot] === 'number') data[slot] = now;
		}
		return JSON.stringify(message);
	} catch {
		return body;
	}
}

export function pageData(
	original: typeof fetch,
	env: { origin: string; path: () => string; now: () => number; refresh: () => void }
) {
	const copies = new Map<string, Copy>();
	// Bumped when a request changes something: what was read before it is out of date
	let generation = 0;
	// The page a history navigation is heading to, until its data is asked for
	let returning: string | null = null;

	function keep(key: string, copy: Copy, since: number) {
		if (since !== generation || copy.body.includes(REDIRECT)) return;
		copies.delete(key);
		copies.set(key, copy);
		if (copies.size > MAX_COPIES) copies.delete(copies.keys().next().value!);
	}

	// Asks the server behind the copy that was shown; when it differs, the page is refreshed
	async function check(key: string, path: string, shown: Copy, ask: () => Promise<Response>) {
		const since = generation;
		try {
			const res = await ask();
			// A copy from the service worker isn't the server's say, and may be older than the one shown
			if (!res.ok || res.headers.has(SAVED_AT_HEADER)) return;
			const body = await res.text();
			if (withNow(body, 0) === withNow(shown.body, 0)) return;
			keep(key, { body, type: shown.type }, since);
			if (trimmed(env.path()) === path) env.refresh();
		} catch {
			// Offline, say: the copy stays
		}
	}

	function standIn(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
		if (method !== 'GET' && method !== 'HEAD') {
			generation++;
			copies.clear();
			return original(input, init);
		}
		const url = new URL(input instanceof Request ? input.url : String(input), env.origin);
		url.hash = '';
		if (url.origin !== env.origin || !url.pathname.endsWith(SUFFIX)) return original(input, init);

		const key = url.href;
		const path = trimmed(url.pathname.slice(0, -SUFFIX.length));
		if (neverKept(path)) return original(input, init);
		const back = returning === path;
		if (back) returning = null;
		const shown = back ? copies.get(key) : undefined;
		if (shown) {
			void check(key, path, shown, () => original(input, init));
			return Promise.resolve(new Response(withNow(shown.body, env.now()), { headers: { 'content-type': shown.type } }));
		}

		const since = generation;
		return original(input, init).then((res) => {
			if (res.ok) {
				const type = res.headers.get('content-type') ?? '';
				res.clone().text().then((body) => keep(key, { body, type }, since), () => {});
			}
			return res;
		});
	}

	return {
		fetch: standIn,
		/** The page a history navigation is going to (null for any other kind of navigation) */
		returningTo(pathname: string | null) {
			returning = pathname === null ? null : trimmed(pathname);
		},
		/** A page the app opened on has its data inside the HTML, so it has no copy yet; this reads one */
		read(href: string) {
			const url = new URL(href, env.origin);
			url.hash = '';
			const slash = url.pathname.endsWith('/');
			url.pathname = url.pathname.replace(/\/$/, '') + SUFFIX;
			// What SvelteKit asks for when the layout is kept and the page is loaded; it says
			// so when the page's address ends in a slash (the top page's does)
			if (slash) url.searchParams.append('x-sveltekit-trailing-slash', '1');
			url.searchParams.append('x-sveltekit-invalidated', '01');
			return standIn(url.href, {}).then(
				() => {},
				() => {}
			);
		}
	};
}
