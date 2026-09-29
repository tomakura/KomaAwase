// Copies of pages the service worker keeps for opening offline. They show the user's own
// timetable, so they are dropped whenever the sign-in page shows (after signing out or leaving).
export const PAGE_CACHE_PREFIX = 'pages-';

// The service worker stamps each copy with the time it was saved (milliseconds), and hands it
// back on the copy it serves, so the page can say how old what it shows is. A page opened from
// a copy also carries the time on <html>, since a document's own response headers can't be read.
export const SAVED_AT_HEADER = 'x-koma-saved-at';
export const CACHED_AT_ATTRIBUTE = 'data-cached-at';
// Set on the requests the app makes itself to refresh the copies (see src/lib/sync.ts): the
// service worker asks the network only, saves the answer and never falls back to a copy.
export const SYNC_HEADER = 'x-koma-sync';
// When each page's copy was last fetched, on this device (with the app's version, since a new
// version clears the copies)
export const FRESH_KEY = 'koma:fresh';

export async function clearPageCaches() {
	try {
		localStorage.removeItem(FRESH_KEY);
	} catch {
		// Storage can be off; the copies below are what matter
	}
	if (typeof caches === 'undefined') return;
	const keys = await caches.keys();
	await Promise.all(keys.filter((k) => k.startsWith(PAGE_CACHE_PREFIX)).map((k) => caches.delete(k)));
}

const DATA_SUFFIX = '/__data.json';

/** The pages whose data is kept on this device, as paths ("/friends"), or null when that can't be read */
export async function cachedPaths(): Promise<Set<string> | null> {
	if (typeof caches === 'undefined') return null;
	try {
		const paths = new Set<string>();
		for (const name of (await caches.keys()).filter((k) => k.startsWith(PAGE_CACHE_PREFIX))) {
			for (const request of await (await caches.open(name)).keys()) {
				const { pathname } = new URL(request.url);
				if (pathname.endsWith(DATA_SUFFIX)) paths.add(pathname.slice(0, -DATA_SUFFIX.length) || '/');
			}
		}
		return paths;
	} catch {
		return null;
	}
}
