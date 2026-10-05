// Keeping the app usable without a connection. The service worker saves every page as it is
// opened (src/service-worker.ts); this file is what the app does on top of that:
//  - a sync: fetch the four tabs one after another, so each has a fresh copy on the device
//    and the timetable opens offline even if the other tabs never were. Only what is out of
//    date is fetched: a copy that came with a page just opened, or with the last sync, is fine
//  - which pages can't be used without the server, and which are on the device
//  - how old the copy on screen is, in words
import { SYNC_HEADER, copyKey } from './offline';
import { daysBetween, monthDay, tokyoTime } from './time';

export type SyncStep = {
	/** The tab this step keeps a copy of */
	path: string;
	label: string;
	/** How long its copy is good for, in milliseconds */
	every: number;
	/** The page's data, and for the top page also the HTML it is opened from */
	requests: { url: string; html?: boolean }[];
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// No x-sveltekit-invalidated here: without it the server sends the whole page, layout included.
// The timetable is what the app opens offline, so it is kept close; the other tabs are only
// there to look at, and are fetched fresh whenever they are opened anyway.
export const SYNC_STEPS: SyncStep[] = [
	{
		path: '/',
		label: '時間割',
		every: 15 * MINUTE,
		requests: [{ url: '/__data.json?x-sveltekit-trailing-slash=1' }, { url: '/', html: true }]
	},
	{ path: '/plans', label: '予定', every: 3 * HOUR, requests: [{ url: '/plans/__data.json' }] },
	{ path: '/friends', label: '友だち', every: 3 * HOUR, requests: [{ url: '/friends/__data.json' }] },
	{ path: '/more', label: 'その他', every: 3 * HOUR, requests: [{ url: '/more/__data.json' }] }
];

/** Just the timetable: what a change (a course added, say) makes out of date */
export const TIMETABLE_STEPS = SYNC_STEPS.slice(0, 1);

/** The requests of a sync, by the key `syncKey` gives for a page's own request for the same thing */
export const SYNC_KEYS = new Set(SYNC_STEPS.flatMap((step) => step.requests.map((r) => r.url)));

/**
 * What a request is, apart from which parts SvelteKit asks to reload: the same page whatever
 * x-sveltekit-invalidated says (the service worker keeps one copy for all of them too).
 */
export function syncKey(url: URL) {
	const copy = new URL(url);
	copy.searchParams.delete('x-sveltekit-invalidated');
	return copy.pathname + copy.search;
}

/**
 * The steps that still have something to fetch, and only that. A request is left out while
 * its answer is newer than `maxAge` (the step's own by default) and the copy is still there:
 * a new version of the app clears the copies, whatever the record of them says.
 */
export function dueSteps(
	steps: SyncStep[],
	env: {
		now: number;
		/** When each request was last answered (by its key) */
		fresh: Record<string, number>;
		/** The pages whose data is on the device, when that is known */
		cached: Set<string> | null;
		maxAge?: number;
		/** Just the timetable, to spare a connection that is costly */
		lean?: boolean;
	}
) {
	return (env.lean ? steps.slice(0, 1) : steps)
		.map((step) => ({
			...step,
			requests: step.requests.filter((r) => {
				if (env.now - (env.fresh[r.url] ?? -Infinity) >= (env.maxAge ?? step.every)) return true;
				return !r.html && env.cached !== null && !env.cached.has(step.path);
			})
		}))
		.filter((step) => step.requests.length > 0);
}

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
	env: {
		fetch: typeof fetch;
		timeout: number;
		progress?: (progress: SyncProgress) => void;
		/** Called with the url of each request as it is answered */
		done?: (url: string) => void;
	}
): Promise<SyncResult> {
	for (const [done, step] of steps.entries()) {
		env.progress?.({ done, total: steps.length, label: step.label });
		try {
			for (const r of step.requests) {
				await request(env.fetch, r, env.timeout);
				env.done?.(r.url);
			}
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
// Pages with nothing to load, which open from the app's own files (/status reads its own, and
// says so when it can't)
const NEEDS_NOTHING = /^\/(install|terms|privacy|status)$/;

const trimmed = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

export function needsServer(pathname: string) {
	return NEEDS_SERVER.test(trimmed(pathname));
}

/** Whether a copy of the page (by path) is on the device, under any query */
export function hasPage(cached: Set<string>, pathname: string) {
	const path = trimmed(pathname);
	for (const key of cached) if (key === path || key.startsWith(`${path}?`)) return true;
	return false;
}

/**
 * Whether a page can be opened offline: its copy is on the device (`cached`, by `copyKey`), or it
 * has none to load. `from` is the page the navigation starts on.
 */
export function openableOffline(target: { pathname: string; search?: string }, cached: Set<string> | null, from?: string) {
	const path = trimmed(target.pathname);
	if (needsServer(path)) return false;
	if (NEEDS_NOTHING.test(path)) return true;
	// When the copies can't be listed, let the navigation try (the worker answers either way)
	if (!cached) return true;
	if (cached.has(copyKey(path, target.search))) return true;
	// Another page is shown from the copy of it the worker has, whatever the query. The same page
	// under another query is other information (who is laid over in the overlay): it needs its own copy.
	return path !== trimmed(from ?? '') && hasPage(cached, path);
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
