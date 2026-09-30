// What the app knows about its connection, and what it does about a bad one:
//  - online: nothing to show; the copies of the tabs are refreshed now and then in the background
//  - poor: the server answered too slowly, so the service worker showed the copy on the device
//  - offline: no connection at all
// While it isn't online the bar at the top says so and when the copy on screen was fetched, the
// copies are refreshed as soon as the server answers again (a small request checks, backing off),
// and whatever needs the server is switched off with a message instead of failing.
// The service worker (src/service-worker.ts) keeps the copies; src/lib/sync.ts lists the pages.
import { CACHED_AT_ATTRIBUTE, FRESH_KEY, SAVED_AT_HEADER, SYNC_HEADER, cachedKeys, dataCopyKey } from './offline';
import {
	SYNC_KEYS,
	SYNC_STEPS,
	TIMETABLE_STEPS,
	dueSteps,
	needsServer,
	openableOffline,
	runSync,
	syncKey,
	type SyncProgress
} from './sync';

export type Link = 'online' | 'poor' | 'offline';
export type Env = {
	origin: string;
	/** The page the app was opened on */
	path: string;
	/** The app's version: a new one clears the copies on the device */
	version: string;
	/**
	 * Whether the service worker is handling this page's requests. Only then is an answer kept
	 * (the first visit isn't controlled yet), so only then does it count as a fresh copy.
	 */
	controlled: () => boolean;
	/** The browser's own fetch, for the app's requests about the connection */
	fetch: typeof fetch;
	/** Loads what is on screen again */
	invalidate: () => Promise<unknown>;
	signedIn: boolean;
};

// A check that takes longer than this counts as a poor connection
const PING_TIMEOUT = 6_000;
const REQUEST_TIMEOUT = 15_000;
const START_DELAY = 4_000;
// Between tries while the connection is down: quick at first, then once a minute
const RETRY_MS = [5_000, 10_000, 20_000, 30_000, 60_000];
// A quick sync shows no bar; one that takes longer than this does
const PROGRESS_DELAY = 1_200;
// The refresh button keeps turning at least this long, so a press is seen to do something
const MIN_SPIN = 700;
const RECOVERED_MS = 2_500;
const TOAST_MS = 4_000;
// After a change, the copy of the timetable is out of date; it is refreshed once things settle
const CHANGE_DELAY = 6_000;
const STALE_AFTER_CHANGE = ['/overlay/__data.json', '/plans/__data.json', '/more/__data.json'];

// The attribute on <body> that has links prepare their page when the pointer nears (src/app.html)
const PRELOAD = 'data-sveltekit-preload-data';

const OFFLINE_NOTICE = 'オフラインのため、その操作はできません';
const POOR_NOTICE = '通信が不安定のため、更新できません';
const REFRESH_FAILED_NOTICE = '更新に失敗しました';

const onLine = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// Asked by the browser to spare data (Chrome on Android, mostly)
const savingData = () => typeof navigator !== 'undefined' && (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;

function readFresh(version: string): Record<string, number> {
	try {
		const saved = JSON.parse(localStorage.getItem(FRESH_KEY) ?? 'null');
		return saved?.version === version && saved.at && typeof saved.at === 'object' ? saved.at : {};
	} catch {
		return {};
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
	// When each page of a sync was last fetched, by syncKey: kept on the device
	#fresh: Record<string, number> = {};
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
		if (!env.signedIn) this.#fresh = {};
		if (!this.#booted) {
			this.#booted = true;
			// A page opened from a copy says when the copy was saved
			const stamp = Number(document.documentElement.getAttribute(CACHED_AT_ATTRIBUTE));
			this.shownAt = stamp > 0 ? stamp : env.signedIn ? Date.now() : null;
			if (env.signedIn) this.#fresh = readFresh(env.version);
			// The page came from the server just now, and the service worker kept it
			if (env.signedIn && stamp <= 0 && env.path === '/') this.#markFresh('/');
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
			else if (env.signedIn && this.#due().length) this.#begin = setTimeout(() => void this.attempt(), START_DELAY);
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
				this.tell(this.#say());
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

	/**
	 * For beforeNavigate: false when the page can't be opened now (and says why). `from` is the
	 * page the navigation starts on: a move within it that changes what it shows (the overlay's
	 * ?with=, who is laid over) needs the server, unless that very view was kept.
	 */
	guardNavigation(url: URL, from?: string) {
		if (!this.blocked || url.origin !== this.#env?.origin) return true;
		if (needsServer(url.pathname)) {
			this.tell(this.#say());
			return false;
		}
		if (!openableOffline(url, this.#cached, from)) {
			this.tell(this.#say());
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
			ok = await this.#connect(env, wasDown, opts.probe ?? false, opts.manual ?? false);
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
			if (opts.manual) this.tell(REFRESH_FAILED_NOTICE);
		}
	}

	async #connect(env: Env, wasDown: boolean, probe: boolean, force: boolean) {
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

		// Only what is out of date (all of it when asked to, with the refresh button)
		const steps = this.#due(force);
		if (steps.length) {
			this.phase = 'syncing';
			const result = await runSync(steps, {
				fetch: env.fetch,
				timeout: REQUEST_TIMEOUT,
				progress: (progress) => (this.progress = progress),
				done: (url) => this.#markFresh(url)
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
			await this.#scan();
		}
		this.#failures = 0;
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
		else if (this.#env?.signedIn && this.#due().length) void this.attempt();
	}

	/** What a sync would fetch now; `force` fetches all of it */
	#due(force = false, maxAge?: number, steps = SYNC_STEPS) {
		return dueSteps(steps, {
			now: Date.now(),
			fresh: this.#fresh,
			cached: this.#cached,
			maxAge: force ? 0 : maxAge,
			lean: !force && savingData()
		});
	}

	#markFresh(key: string) {
		if (!SYNC_KEYS.has(key) || !this.#env?.controlled()) return;
		this.#fresh[key] = Date.now();
		this.#remember();
	}

	/** Takes pages off the record of what is fresh: their copies are out of date, and the next sync fetches them */
	#forget(keys: string[]) {
		for (const key of keys) delete this.#fresh[key];
		this.#remember();
	}

	#remember() {
		try {
			localStorage.setItem(FRESH_KEY, JSON.stringify({ version: this.#env?.version, at: this.#fresh }));
		} catch {
			// Kept in memory only
		}
	}

	async #scan() {
		this.#cached = await cachedKeys();
	}

	/** An answer to a page's data request went by */
	#seen(res: Response, url: URL) {
		// The service worker keeps every page it gets: it can be opened again offline
		if (res.ok) this.#cached?.add(dataCopyKey(url));
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
			// The service worker kept this answer: it is as good as a sync of that page
			this.#markFresh(syncKey(url));
			// The server just answered; don't wait for the next try
			if (this.blocked && !this.#running) void this.attempt();
		}
	}

	/** A request failed without an answer: find out whether the connection is gone */
	#suspect() {
		if (!this.blocked && !this.#running) void this.attempt({ probe: true });
	}

	#changed() {
		// Pages made from the timetable are out of date too: the overlay shows it beside friends',
		// and その他 names the term and the periods. They wait for the next sync (3 hours is fine
		// for a tab nobody changed, not for one this change touched).
		this.#forget(STALE_AFTER_CHANGE);
		clearTimeout(this.#change);
		this.#change = setTimeout(() => void this.#refreshTimetable(), CHANGE_DELAY);
	}

	// The copy the app opens from should show what was just changed
	async #refreshTimetable() {
		const env = this.#env;
		if (!env?.signedIn || this.#running || this.blocked) return;
		// What was fetched since the change is already right (the page it left for, usually)
		const steps = this.#due(false, CHANGE_DELAY, TIMETABLE_STEPS);
		if (steps.length) await runSync(steps, { fetch: env.fetch, timeout: REQUEST_TIMEOUT, done: (url) => this.#markFresh(url) });
	}

	#guardSubmit(e: SubmitEvent) {
		if (!this.blocked) return;
		const form = e.target;
		// A form that only looks something up leaves through the page navigation, which is guarded
		if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post') return;
		e.preventDefault();
		e.stopImmediatePropagation();
		this.tell(this.#say());
	}

	// One sentence for whatever can't be done: what's wrong is the connection
	#say() {
		return this.#link === 'poor' ? POOR_NOTICE : OFFLINE_NOTICE;
	}
}

export const connection = new Connection();
