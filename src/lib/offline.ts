// Copies of pages the service worker keeps for opening offline. They show the user's own
// timetable, so they are dropped whenever the sign-in page shows (after signing out or leaving).
export const PAGE_CACHE_PREFIX = 'pages-';

// Never kept, by the service worker or by the copies kept for going back (src/lib/page-data.ts):
// sign-in, anything that changes data, files, the Worker's own routes, the admin pages (other
// people's reports and feedback), and the pages that show an email address or the devices
const NEVER_KEPT =
	/^\/(login|logout|auth|api|internal|verify|admin|contact|feedback|import\/upload|more\/(data|delete|verify|sessions|passkeys)|courses\/[^/]+\/files)(\/|$)/;

export const neverKept = (pathname: string) => NEVER_KEPT.test(pathname);

// Pages that show other people (friends, groups, the overlay, shared courses): a copy of one
// is shown for this long at most, so someone who stopped sharing doesn't stay on the device.
// The user's own pages are kept until a new version of the app or signing out.
const OTHERS = /^\/(friends|groups|overlay|shared|join)(\/|$)/;
export const OTHERS_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

/** How long a page's copy may still be shown after it was saved */
export const copyMaxAge = (pathname: string) => (OTHERS.test(pathname) ? OTHERS_MAX_AGE : Infinity);

// The account the copies on this device were made for (see forgetOtherAccount)
const OWNER_KEY = 'koma:owner';

// The service worker stamps each copy with the time it was saved (milliseconds), and hands it
// back on the copy it serves, so the page can say how old what it shows is. A page opened from
// a copy also carries the time on <html>, since a document's own response headers can't be read.
export const SAVED_AT_HEADER = 'x-koma-saved-at';
export const CACHED_AT_ATTRIBUTE = 'data-cached-at';
// Set on the requests the app makes itself to refresh the copies (see src/lib/sync.ts): the
// service worker asks the network only, saves the answer and never falls back to a copy.
export const SYNC_HEADER = 'x-koma-sync';
// Set by the app on a page's data request while it knows the connection is down or poor: the
// service worker shows the copy at once instead of giving the network a few seconds first
export const COPY_FIRST_HEADER = 'x-koma-copy-first';
// When each page's copy was last fetched, on this device (with the app's version, since a new
// version clears the copies)
export const FRESH_KEY = 'koma:fresh';

// Drafts of what was being typed (src/lib/draft.ts), cleared with the copies
export const DRAFT_PREFIX = 'koma:draft:';

function clearDrafts() {
	try {
		for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
	} catch {
		// Storage can be off
	}
}

export async function clearPageCaches() {
	try {
		localStorage.removeItem(FRESH_KEY);
		localStorage.removeItem(OWNER_KEY);
	} catch {
		// Storage can be off; the copies below are what matter
	}
	clearDrafts();
	if (typeof caches === 'undefined') return;
	const keys = await caches.keys();
	await Promise.all(keys.filter((k) => k.startsWith(PAGE_CACHE_PREFIX)).map((k) => caches.delete(k)));
}

const DATA_SUFFIX = '/__data.json';
// SvelteKit's own query parameters: they say how the page is asked for, not which page it is
const SVELTEKIT_PARAMS = ['x-sveltekit-invalidated', 'x-sveltekit-trailing-slash'];

/**
 * Which copy a page is: its path, and the query that changes what it shows ("/overlay?with=u2").
 * The overlay lays other people over the timetable by its ?with=, so each choice is a page of its own.
 */
export function copyKey(pathname: string, search = '') {
	const params = new URLSearchParams(search);
	for (const name of SVELTEKIT_PARAMS) params.delete(name);
	const query = params.toString();
	return (pathname.replace(/\/+$/, '') || '/') + (query ? `?${query}` : '');
}

/** The copy a data request (…/__data.json?…) is for */
export function dataCopyKey(url: URL) {
	return copyKey(url.pathname.endsWith(DATA_SUFFIX) ? url.pathname.slice(0, -DATA_SUFFIX.length) : url.pathname, url.search);
}

/** The pages whose data is kept on this device, by `copyKey`, or null when that can't be read */
export async function cachedKeys(): Promise<Set<string> | null> {
	if (typeof caches === 'undefined') return null;
	try {
		const keys = new Set<string>();
		for (const name of (await caches.keys()).filter((k) => k.startsWith(PAGE_CACHE_PREFIX))) {
			for (const request of await (await caches.open(name)).keys()) {
				const url = new URL(request.url);
				if (url.pathname.endsWith(DATA_SUFFIX)) keys.add(dataCopyKey(url));
			}
		}
		return keys;
	} catch {
		return null;
	}
}

/**
 * Drops the copies when the page is opened by another account than the one they were made
 * for, whichever way it signed in. Signing out clears them already; this also covers a
 * session that changed without passing the sign-in page.
 */
export async function forgetOtherAccount(userId: string) {
	let before: string | null;
	try {
		before = localStorage.getItem(OWNER_KEY);
	} catch {
		return;
	}
	if (before === userId) return;
	if (before !== null) await clearPageCaches().catch(() => {});
	try {
		localStorage.setItem(OWNER_KEY, userId);
	} catch {
		// Storage can be off
	}
}
