// What the app knows about its connection, and what it does about a bad one:
//  - online: nothing to show; the copies of the tabs are refreshed now and then in the background
//  - poor: the server answered too slowly, so the service worker showed the copy on the device
//  - offline: no connection at all
// While it isn't online the bar at the top says so and when the copy on screen was fetched, the
// copies are refreshed as soon as the server answers again (a small request checks, backing off),
// and whatever needs the server is switched off with a message instead of failing.
// The service worker (src/service-worker.ts) keeps the copies; src/lib/sync.ts lists the pages.
import { CACHED_AT_ATTRIBUTE, SAVED_AT_HEADER, SYNCED_KEY, SYNC_HEADER, cachedPaths } from './offline';
import { SYNC_STEPS, TIMETABLE_STEPS, needsServer, openableOffline, runSync, type SyncProgress } from './sync';

export type Link = 'online' | 'poor' | 'offline';
export type Env = {
	origin: string;
	/** The browser's own fetch, for the app's requests about the connection */
	fetch: typeof fetch;
	/** Loads what is on screen again */
	invalidate: () => Promise<unknown>;
	signedIn: boolean;
};

// A check that takes longer than this counts as a poor connection
const PING_TIMEOUT = 6_000;
const REQUEST_TIMEOUT = 15_000;
// The copies are refreshed when the app opens if they are older than this
const FRESH_MS = 15 * 60_000;
const START_DELAY = 4_000;
// Between tries while the connection is down: quick at first, then every 30 seconds
const RETRY_MS = [5_000, 10_000, 20_000, 30_000];
// A quick sync shows no bar; one that takes longer than this does
const PROGRESS_DELAY = 1_200;
// The refresh button keeps turning at least this long, so a press is seen to do something
const MIN_SPIN = 700;
const RECOVERED_MS = 2_500;
const TOAST_MS = 4_000;
// After a change, the copy of the timetable is out of date; it is refreshed once things settle
const CHANGE_DELAY = 6_000;

// The attribute on <body> that has links prepare their page when the pointer nears (src/app.html)
const PRELOAD = 'data-sveltekit-preload-data';

const CAUSE = { offline: 'オフラインのため', poor: '通信が不安定なため' } as const;

const onLine = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

function readSyncedAt() {
	try {
		return Number(localStorage.getItem(SYNCED_KEY)) || null;
	} catch {
		return null;
	}
}

function writeSyncedAt(ms: number) {
	try {
		localStorage.setItem(SYNCED_KEY, String(ms));
	} catch {
		// Kept in memory only
	}
}

export class Connection {
	#link = $state<Link>('online');
	/** What the app is doing about it: asking whether the server answers, or refreshing the copies */
	phase = $state<'idle' | 'checking' | 'syncing'>('idle');
	progress = $state<SyncProgress | null>(null);
	/** Turns true a moment into a sync, so that a quick one doesn't flash a bar */
	slow = $state(false);
	/** When the information on screen was fetched from the server (milliseconds) */
	shownAt = $state<number | null>(null);
	/** Shows for a moment when the connection comes back */
	recovered = $state(false);
	notice = $state<{ id: number; text: string } | null>(null);

	#env?: Env;
	#preload: string | null | undefined;
	#booted = false;
	#running = false;
	#failures = 0;
	#syncedAt: number | null = null;
	#cached: Set<string> | null = null;
	#noticeId = 0;
	#retry?: ReturnType<typeof setTimeout>;
	#begin?: ReturnType<typeof setTimeout>;
	#toast?: ReturnType<typeof setTimeout>;
	#flash?: ReturnType<typeof setTimeout>;
	#change?: ReturnType<typeof setTimeout>;

	get link() {
		return this.#link;
	}

	set link(link: Link) {
		// Pages opened since the copies were last listed are on the device too
		if (link !== 'online' && this.#link === 'online') void this.#scan();
		this.#link = link;
		if (typeof document === 'undefined') return;
		// For the style sheet: things that need the server are dimmed while this is set
		if (link === 'online') delete document.documentElement.dataset.offline;
		else document.documentElement.dataset.offline = link;
		// Pages aren't prepared while the connection is bad: it would only fail, or take the
		// connection from the refresh
		const body = document.body;
		if (!body) return;
		if (link !== 'online') {
			this.#preload ??= body.getAttribute(PRELOAD);
			body.setAttribute(PRELOAD, 'off');
		} else if (this.#preload !== undefined) {
			if (this.#preload === null) body.removeAttribute(PRELOAD);
			else body.setAttribute(PRELOAD, this.#preload);
			this.#preload = undefined;
		}
	}

	/** Whether what needs the server is switched off */
	get blocked() {
		return this.#link !== 'online';
	}

	get visible() {
		return this.blocked || this.recovered || (this.phase === 'syncing' && this.slow);
	}

	/**
	 * Starts watching. Call it in an effect and run what it returns when the effect ends. The
	 * copies are refreshed only for a signed-in user; the rest works for anyone.
	 */
	start(env: Env) {
		this.#env = env;
		if (!this.#booted) {
			this.#booted = true;
			// A page opened from a copy says when the copy was saved
			const stamp = Number(document.documentElement.getAttribute(CACHED_AT_ATTRIBUTE));
			this.shownAt = stamp > 0 ? stamp : env.signedIn ? Date.now() : null;
			this.#syncedAt = readSyncedAt();
			this.link = !onLine() ? 'offline' : stamp > 0 ? 'poor' : 'online';
		}

		const online = () => void this.attempt();
		const offline = () => {
			this.link = 'offline';
			void this.#scan();
		};
		const visibility = () => {
			if (!document.hidden) this.#wake();
		};
		const submit = (e: SubmitEvent) => this.#guardSubmit(e);
		addEventListener('online', online);
		addEventListener('offline', offline);
		document.addEventListener('visibilitychange', visibility);
		// Before the form's own handler, which sends it
		document.addEventListener('submit', submit, true);

		void this.#scan().then(() => {
			if (this.link !== 'online') void this.attempt();
			else if (env.signedIn && this.#stale()) this.#begin = setTimeout(() => void this.attempt(), START_DELAY);
		});

		return () => {
			removeEventListener('online', online);
			removeEventListener('offline', offline);
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('submit', submit, true);
			clearTimeout(this.#begin);
			clearTimeout(this.#retry);
			clearTimeout(this.#change);
		};
	}

	/**
	 * Wraps fetch to watch the app's requests: how old an answer is (a copy from the device is
	 * marked), a request that fails outright (the connection may be gone), and changes made (the
	 * copy of the timetable is refreshed after). While the connection is down a request that
	 * changes something is not sent.
	 */
	observe(original: typeof fetch, origin: string): typeof fetch {
		return async (input, init) => {
			const request = input instanceof Request ? input : null;
			const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
			const url = new URL(request ? request.url : String(input), origin);
			const ours = url.origin === origin && !new Headers(init?.headers ?? request?.headers).has(SYNC_HEADER);
			const change = ours && method !== 'GET' && method !== 'HEAD';
			if (change && this.blocked) {
				this.tell(this.#say('action'));
				throw new TypeError('offline');
			}
			let res: Response;
			try {
				res = await original(input, init);
			} catch (e) {
				if (ours && (e as Error)?.name !== 'AbortError') this.#suspect();
				throw e;
			}
			if (change && res.ok) this.#changed();
			else if (ours && !change && url.pathname.endsWith('/__data.json')) this.#seen(res, url);
			return res;
		};
	}

	/** For beforeNavigate: false when the page can't be opened now (and says why) */
	guardNavigation(url: URL) {
		if (!this.blocked || url.origin !== this.#env?.origin) return true;
		if (needsServer(url.pathname)) {
			this.tell(this.#say('add'));
			return false;
		}
		if (!openableOffline(url.pathname, this.#cached)) {
			this.tell(this.#say('unsaved'));
			return false;
		}
		return true;
	}

	tell(text: string) {
		this.notice = { id: ++this.#noticeId, text };
		clearTimeout(this.#toast);
		this.#toast = setTimeout(() => (this.notice = null), TOAST_MS);
	}

	/** The refresh button */
	refresh() {
		if (!this.#running) void this.attempt({ manual: true });
	}

	/**
	 * Finds out whether the server answers (when the connection is down, or `probe` is set),
	 * then refreshes the copies. When it was down, what is on screen is loaded again after.
	 */
	async attempt(opts: { probe?: boolean; manual?: boolean } = {}) {
		const env = this.#env;
		if (!env || this.#running) return;
		this.#running = true;
		clearTimeout(this.#retry);
		clearTimeout(this.#begin);
		const began = Date.now();
		const wasDown = this.blocked;
		this.slow = false;
		const slowTimer = setTimeout(() => (this.slow = true), PROGRESS_DELAY);
		let ok = false;
		try {
			ok = await this.#connect(env, wasDown, opts.probe ?? false);
			if (opts.manual) await pause(MIN_SPIN - (Date.now() - began));
		} finally {
			clearTimeout(slowTimer);
			this.slow = false;
			this.phase = 'idle';
			this.progress = null;
			this.#running = false;
		}
		if (ok) return;
		if (this.blocked) {
			this.#retrySoon();
			if (opts.manual) this.tell(`${CAUSE[this.#link as Exclude<Link, 'online'>]}、まだ更新できません。電波のよいところでもう一度お試しください。`);
		}
	}

	async #connect(env: Env, wasDown: boolean, probe: boolean) {
		if (wasDown || probe) {
			this.phase = 'checking';
			const ping = await this.#ping(env);
			if (ping !== 'ok') {
				this.link = ping === 'slow' ? 'poor' : 'offline';
				return false;
			}
			if (!env.signedIn) {
				this.link = 'online';
				return true;
			}
			// A check that found nothing wrong
			if (!wasDown) return true;
		}
		if (!env.signedIn) return true;

		this.phase = 'syncing';
		const result = await runSync(SYNC_STEPS, {
			fetch: env.fetch,
			timeout: REQUEST_TIMEOUT,
			progress: (progress) => (this.progress = progress)
		});
		if (!result.ok) {
			if (result.reason === 'offline') this.link = 'offline';
			else if (result.reason === 'slow') this.link = 'poor';
			else if (result.reason === 'signed-out') {
				// The server answered; there is just nothing to keep for a signed-out user
				this.link = 'online';
				return true;
			}
			return false;
		}

		this.#syncedAt = Date.now();
		writeSyncedAt(this.#syncedAt);
		this.#failures = 0;
		await this.#scan();
		if (wasDown) {
			this.link = 'online';
			this.recovered = true;
			clearTimeout(this.#flash);
			this.#flash = setTimeout(() => (this.recovered = false), RECOVERED_MS);
			// What is on screen came from a copy; fetch it again
			await env.invalidate().catch(() => {});
		}
		return true;
	}

	async #ping(env: Env): Promise<'ok' | 'slow' | 'offline'> {
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, PING_TIMEOUT);
		try {
			// Answered by the Worker before anything else is read (src/hooks.server.ts)
			const res = await env.fetch(`/api/ping?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
			return res.status === 204 ? 'ok' : 'offline';
		} catch {
			return timedOut ? 'slow' : 'offline';
		} finally {
			clearTimeout(timer);
		}
	}

	#retrySoon() {
		// A hidden page tries again when it is shown (#wake)
		if (typeof document !== 'undefined' && document.hidden) return;
		const delay = RETRY_MS[Math.min(this.#failures, RETRY_MS.length - 1)];
		this.#failures++;
		this.#retry = setTimeout(() => void this.attempt(), delay);
	}

	#wake() {
		if (this.blocked) void this.attempt();
		else if (this.#env?.signedIn && this.#stale()) void this.attempt();
	}

	#stale() {
		const missing = this.#cached ? SYNC_STEPS.some((s) => !this.#cached!.has(s.path)) : false;
		return missing || !this.#syncedAt || Date.now() - this.#syncedAt > FRESH_MS;
	}

	async #scan() {
		this.#cached = await cachedPaths();
	}

	/** An answer to a page's data request went by */
	#seen(res: Response, url: URL) {
		// The service worker keeps every page it gets: it can be opened again offline
		if (res.ok) this.#cached?.add(url.pathname.slice(0, -'/__data.json'.length) || '/');
		const saved = Number(res.headers.get(SAVED_AT_HEADER));
		if (saved > 0) {
			// The service worker gave a copy: the network was down or too slow
			this.shownAt = saved;
			if (!this.blocked) {
				this.link = onLine() ? 'poor' : 'offline';
				void this.attempt();
			}
		} else if (res.ok) {
			this.shownAt = Date.now();
			// The server just answered; don't wait for the next try
			if (this.blocked && !this.#running) void this.attempt();
		}
	}

	/** A request failed without an answer: find out whether the connection is gone */
	#suspect() {
		if (!this.blocked && !this.#running) void this.attempt({ probe: true });
	}

	#changed() {
		clearTimeout(this.#change);
		this.#change = setTimeout(() => void this.#refreshTimetable(), CHANGE_DELAY);
	}

	// The copy the app opens from should show what was just changed
	async #refreshTimetable() {
		const env = this.#env;
		if (!env?.signedIn || this.#running || this.blocked) return;
		await runSync(TIMETABLE_STEPS, { fetch: env.fetch, timeout: REQUEST_TIMEOUT });
		this.#syncedAt = Date.now();
		writeSyncedAt(this.#syncedAt);
	}

	#guardSubmit(e: SubmitEvent) {
		if (!this.blocked) return;
		const form = e.target;
		// A form that only looks something up leaves through the page navigation, which is guarded
		if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post') return;
		e.preventDefault();
		e.stopImmediatePropagation();
		this.tell(this.#say('action'));
	}

	#say(what: 'action' | 'add' | 'unsaved') {
		const cause = CAUSE[this.#link === 'poor' ? 'poor' : 'offline'];
		if (what === 'add') return `${cause}、授業の追加などはできません。つながってからお試しください。`;
		if (what === 'unsaved') return `${cause}、このページは開けません。まだ端末に保存されていません。`;
		return `${cause}、この操作はできません。つながってからお試しください。`;
	}
}

export const connection = new Connection();
