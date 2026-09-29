// Keeping the app usable without a connection. The service worker saves every page as it is
// opened (src/service-worker.ts); this file is what the app does on top of that:
//  - a sync: fetch the four tabs one after another, so each has a fresh copy on the device
//    and the timetable opens offline even if the other tabs never were
//  - which pages can't be used without the server, and which are on the device
//  - how old the copy on screen is, in words
import { SYNC_HEADER } from './offline';
import { daysBetween, monthDay, tokyoTime } from './time';

export type SyncStep = {
	/** The tab this step keeps a copy of */
	path: string;
	label: string;
	/** The page's data, and for the top page also the HTML it is opened from */
	requests: { url: string; html?: boolean }[];
};

// No x-sveltekit-invalidated here: without it the server sends the whole page, layout included
export const SYNC_STEPS: SyncStep[] = [
	{ path: '/', label: '時間割', requests: [{ url: '/__data.json?x-sveltekit-trailing-slash=1' }, { url: '/', html: true }] },
	{ path: '/overlay', label: '重ねる', requests: [{ url: '/overlay/__data.json' }] },
	{ path: '/friends', label: '友だち', requests: [{ url: '/friends/__data.json' }] },
	{ path: '/more', label: 'その他', requests: [{ url: '/more/__data.json' }] }
];

/** Just the timetable: what a change (a course added, say) makes out of date */
export const TIMETABLE_STEPS = SYNC_STEPS.slice(0, 1);

export type SyncProgress = { done: number; total: number; label: string };
export type SyncFailure = 'offline' | 'slow' | 'error' | 'signed-out';
export type SyncResult = { ok: true } | { ok: false; reason: SyncFailure };

class SyncError extends Error {
	constructor(readonly reason: SyncFailure) {
		super(reason);
	}
}

// A data request that finds the user signed out is answered with a redirect, as JSON
const REDIRECT = '"type":"redirect"';

async function request(fetcher: typeof fetch, step: SyncStep['requests'][number], timeout: number) {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeout);
	try {
		const res = await fetcher(step.url, {
			headers: step.html ? { [SYNC_HEADER]: '1', accept: 'text/html' } : { [SYNC_HEADER]: '1' },
			cache: 'no-store',
			signal: controller.signal
		});
		// Read to the end, so the copy the service worker keeps is whole
		const body = await res.text();
		if (step.html ? res.redirected : body.includes(REDIRECT)) throw new SyncError('signed-out');
		if (!res.ok) throw new SyncError('error');
	} catch (e) {
		if (e instanceof SyncError) throw e;
		// The request never got an answer in time, or never got as far as asking
		throw new SyncError(timedOut ? 'slow' : 'offline');
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetches the pages one by one, reporting how far it got before each. Stops at the first
 * failure: a connection that lets one request fail will fail the rest, and each costs data.
 */
export async function runSync(
	steps: SyncStep[],
	env: { fetch: typeof fetch; timeout: number; progress?: (progress: SyncProgress) => void }
): Promise<SyncResult> {
	for (const [done, step] of steps.entries()) {
		env.progress?.({ done, total: steps.length, label: step.label });
		try {
			for (const r of step.requests) await request(env.fetch, r, env.timeout);
		} catch (e) {
			return { ok: false, reason: e instanceof SyncError ? e.reason : 'error' };
		}
	}
	env.progress?.({ done: steps.length, total: steps.length, label: '' });
	return { ok: true };
}

// Pages that only make sense with the server: adding courses (a search of what others
// registered, the form, the screenshot reader) and the ways of adding people. A copy of one
// would show a search that can't be searched. Keep the matching links in src/app.css in step.
const NEEDS_SERVER = /^\/(courses\/(new|search)|import|friends\/add|groups\/new)(\/|$)/;
// Pages with nothing to load, which open from the app's own files
const NEEDS_NOTHING = /^\/(install|terms|privacy)$/;

const trimmed = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

export function needsServer(pathname: string) {
	return NEEDS_SERVER.test(trimmed(pathname));
}

/** Whether a page can be opened offline: its data is on the device (`cached`), or it has none */
export function openableOffline(pathname: string, cached: Set<string> | null) {
	const path = trimmed(pathname);
	if (needsServer(path)) return false;
	// When the copies can't be listed, let the navigation try (the worker answers either way)
	return !cached || cached.has(path) || NEEDS_NOTHING.test(path);
}

/** 今日 8:05, 昨日 21:40, 9/27 12:30: when the copy on screen was fetched (Japan time) */
export function savedAtLabel(savedAt: number, now: number) {
	const t = tokyoTime(savedAt);
	const hour = Math.floor(t.minutes / 60);
	const minute = String(Math.floor(t.minutes % 60)).padStart(2, '0');
	const days = daysBetween(t.date, tokyoTime(now).date);
	const day = days <= 0 ? '今日' : days === 1 ? '昨日' : monthDay(t.date);
	return `${day} ${hour}:${minute}`;
}
