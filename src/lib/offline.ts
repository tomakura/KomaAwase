// Copies of pages the service worker keeps for opening offline. They show the user's own
// timetable, so they are dropped whenever the sign-in page shows (after signing out or leaving).
export const PAGE_CACHE_PREFIX = 'pages-';

export async function clearPageCaches() {
	if (typeof caches === 'undefined') return;
	const keys = await caches.keys();
	await Promise.all(keys.filter((k) => k.startsWith(PAGE_CACHE_PREFIX)).map((k) => caches.delete(k)));
}
