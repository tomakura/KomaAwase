import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, type Env } from './connection.svelte';
import { FRESH_KEY, SAVED_AT_HEADER, SYNC_HEADER } from './offline';
import { SYNC_KEYS } from './sync';

const ORIGIN = 'https://koma.test';

class FakeForm {
	constructor(readonly method: string) {}
}

// The browser, as far as the connection reaches it: the page, the window's events, storage
// and a network that can be up, down, or so slow that nothing comes back.
// Every page of a sync fetched just now, as the app keeps the record
const allFresh = (ago = 0) => JSON.stringify({ version: 'v1', at: Object.fromEntries([...SYNC_KEYS].map((key) => [key, Date.now() - ago])) });

function setup(
	opts: {
		onLine?: boolean;
		cachedAt?: number;
		signedIn?: boolean;
		cached?: string[];
		synced?: boolean | string;
		path?: string;
		saveData?: boolean;
		/** Whether the service worker handles the page (false: the first visit) */
		controlled?: boolean;
	} = {}
) {
	const page = new Map<string, (e?: unknown) => void>();
	const win = new Map<string, () => void>();
	const stored = new Map<string, string>();
	if (opts.synced) stored.set(FRESH_KEY, typeof opts.synced === 'string' ? opts.synced : allFresh());
	const root = { dataset: {} as Record<string, string>, style: { setProperty() {}, removeProperty() {} } };
	const browser = { onLine: opts.onLine ?? true, connection: { saveData: opts.saveData ?? false } };
	const attributes = new Map<string, string>([['data-sveltekit-preload-data', 'hover']]);
	vi.stubGlobal('document', {
		hidden: false,
		body: {
			getAttribute: (k: string) => attributes.get(k) ?? null,
			setAttribute: (k: string, v: string) => void attributes.set(k, v),
			removeAttribute: (k: string) => void attributes.delete(k)
		},
		documentElement: { ...root, getAttribute: () => (opts.cachedAt ? String(opts.cachedAt) : null) },
		addEventListener: (type: string, fn: () => void) => page.set(type, fn),
		removeEventListener: (type: string) => page.delete(type)
	});
	vi.stubGlobal('addEventListener', (type: string, fn: () => void) => win.set(type, fn));
	vi.stubGlobal('removeEventListener', (type: string) => win.delete(type));
	vi.stubGlobal('navigator', browser);
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => stored.get(k) ?? null,
		setItem: (k: string, v: string) => void stored.set(k, v),
		removeItem: (k: string) => void stored.delete(k)
	});
	vi.stubGlobal('HTMLFormElement', FakeForm);
	if (opts.synced) opts.cached ??= ['/', '/overlay', '/friends', '/more'];
	if (opts.cached) {
		// Read when asked, as the service worker keeps adding to it
		const list = opts.cached;
		// 'path' or 'path?query': a copy of the page under that query
		const requests = () =>
			list.map((key) => {
				const [path, query] = key.split('?');
				return { url: `${ORIGIN}${path === '/' ? '' : path}/__data.json${query ? `?${query}` : ''}` };
			});
		vi.stubGlobal('caches', { keys: async () => ['pages-v1'], open: async () => ({ keys: async () => requests() }) });
	}

	const net = { up: true, hang: false };
	const asked: string[] = [];
	const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		asked.push(url.replace(/\?t=\d+$/, ''));
		if (!net.up) throw new TypeError('Failed to fetch');
		if (net.hang) {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		}
		if (url.startsWith('/api/ping')) return new Response(null, { status: 204 });
		return new Response(url === '/' ? '<html></html>' : '{"type":"data","nodes":[]}');
	});
	const invalidate = vi.fn(async () => {});
	const env: Env = { origin: ORIGIN, path: opts.path ?? '/friends', version: 'v1', controlled: () => opts.controlled ?? true, fetch: fetcher as unknown as typeof fetch, invalidate, signedIn: opts.signedIn ?? true };
	const connection = new Connection();
	const stop = connection.start(env);
	return { connection, net, asked, fetcher, invalidate, page, win, stored, browser, root: document.documentElement, stop, saved: opts.cached, attributes };
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const pings = (asked: string[]) => asked.filter((u) => u.startsWith('/api/ping')).length;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('starting', () => {
	it('stays quiet when online and freshly synced', async () => {
		const { connection, asked } = setup({ synced: true });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(asked).toEqual([]);
		expect(connection.link).toBe('online');
		expect(connection.visible).toBe(false);
	});

	it('fetches only the tab whose copy is gone, even if the last sync was recent (a new version clears them)', async () => {
		const { asked } = setup({ synced: true, cached: ['/', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(asked).toEqual(['/overlay/__data.json']);
	});

	it('fetches only what is out of date: the timetable after 15 minutes, the other tabs after 3 hours', async () => {
		const ago = (minutes: number) => allFresh(minutes * 60_000);
		const quarter = setup({ synced: ago(16), cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(quarter.asked).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/']);
		quarter.stop();

		const hours = setup({ synced: ago(181), cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(hours.asked).toHaveLength(5);
		hours.stop();

		const recent = setup({ synced: ago(14), cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(recent.asked).toEqual([]);
	});

	it('does not fetch a page that was just opened: its answer counts, and so does a page loaded from the server', async () => {
		const opened = setup({ path: '/', synced: false, cached: ['/', '/overlay', '/friends', '/more'] });
		// The top page came with the app: its HTML is fresh, its data is not yet
		await vi.advanceTimersByTimeAsync(5_000);
		expect(opened.asked).toContain('/__data.json?x-sveltekit-trailing-slash=1');
		expect(opened.asked).not.toContain('/');
		opened.stop();

		const s = setup({ synced: ago(200), cached: ['/', '/overlay', '/friends', '/more'] });
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		// Opened by a link: SvelteKit asks with the parts to reload, which is the same page
		await fetch('/friends/__data.json?x-sveltekit-invalidated=01');
		await fetch('/overlay/__data.json?x-sveltekit-invalidated=11');
		await vi.advanceTimersByTimeAsync(5_000);
		// The timetable and 'その他' are out of date; the two tabs just opened are not fetched again
		expect(s.asked).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/', '/more/__data.json']);
		function ago(minutes: number) {
			return allFresh(minutes * 60_000);
		}
	});

	it('makes the overlay and その他 out of date after a change, whatever their age, for the next sync', async () => {
		const s = setup({ synced: true });
		await flush(); // the decision made when the app opens comes first
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/courses/abc/edit', { method: 'POST' });
		const recorded = JSON.parse(s.stored.get(FRESH_KEY)!).at;
		expect(Object.keys(recorded)).not.toContain('/overlay/__data.json');
		expect(Object.keys(recorded)).not.toContain('/more/__data.json');
		expect(Object.keys(recorded)).toContain('/friends/__data.json');

		// The timetable is refreshed once things settle; the two tabs wait for the next sync
		await vi.advanceTimersByTimeAsync(7_000);
		expect(s.asked).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/']);
		s.asked.length = 0;
		s.page.get('visibilitychange')!();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(s.asked).toEqual(['/overlay/__data.json', '/more/__data.json']);
	});

	it('does not take a page as saved before the service worker handles the app (the first visit)', async () => {
		// Opened on the top page, but nothing kept it: the whole sync is still due, HTML included
		const first = setup({ path: '/', synced: false, controlled: false, cached: null as never });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(first.stored.get(FRESH_KEY)).toBeUndefined();
		first.stop();

		// The same after the sync, whose answers weren't kept either
		const later = setup({ path: '/', synced: false, controlled: false });
		const fetch = later.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/friends/__data.json');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(later.stored.get(FRESH_KEY)).toBeUndefined();
	});

	it('fetches the HTML of the top page too on a first visit, and stops asking for it once it is kept', async () => {
		const s = setup({ path: '/', synced: false, controlled: true, cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		// Loaded with the app under the service worker: its HTML is kept
		expect(s.asked).not.toContain('/');
		s.stop();

		const first = setup({ path: '/', synced: false, controlled: false });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(first.asked).toContain('/');
	});

	it('does not count an answer from a saved copy as fresh', async () => {
		const s = setup({ synced: allFresh(200 * 60_000), cached: ['/', '/overlay', '/friends', '/more'] });
		const fetch = s.connection.observe(
			(async () => new Response('{}', { headers: { [SAVED_AT_HEADER]: String(Date.now() - 1000) } })) as typeof globalThis.fetch,
			ORIGIN
		);
		s.net.hang = true;
		await fetch('/friends/__data.json');
		await vi.advanceTimersByTimeAsync(0);
		expect(JSON.parse(s.stored.get(FRESH_KEY)!).at['/friends/__data.json']).toBeLessThan(Date.now() - 100 * 60_000);
	});

	it('remembers the pages by the version of the app: a new one starts again', async () => {
		const s = setup({ synced: JSON.stringify({ version: 'v0', at: JSON.parse(allFresh()).at }), cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(s.asked).toHaveLength(5);
	});

	it('syncs only the timetable when the browser asks to spare data, but everything when the button is pressed', async () => {
		const s = setup({ saveData: true, synced: false, cached: ['/', '/overlay', '/friends', '/more'] });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(s.asked).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/']);

		s.asked.length = 0;
		s.net.up = false;
		s.connection.link = 'offline';
		await flush();
		s.net.up = true;
		s.connection.refresh();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(s.asked.filter((u) => !u.startsWith('/api/ping'))).toHaveLength(5);
	});

	it('does not touch the network for a signed-out user', async () => {
		const { asked, connection } = setup({ signedIn: false });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(asked).toEqual([]);
		expect(connection.shownAt).toBeNull();
	});

	it('begins offline when the device says so', () => {
		const { connection } = setup({ onLine: false });
		expect(connection.link).toBe('offline');
		expect(connection.blocked).toBe(true);
		// What the style sheet dims things by
		expect(document.documentElement.dataset.offline).toBe('offline');
	});

	it('takes a page opened from a saved copy as a poor connection, and says when the copy was saved', () => {
		const savedAt = Date.UTC(2026, 8, 28, 3, 0);
		const { connection } = setup({ cachedAt: savedAt });
		expect(connection.link).toBe('poor');
		expect(connection.shownAt).toBe(savedAt);
		expect(connection.visible).toBe(true);
	});
});

describe('when the connection is down', () => {
	it('checks the server, refreshes the copies and loads the screen again once it answers', async () => {
		const s = setup({ onLine: false, cachedAt: Date.UTC(2026, 8, 28, 3, 0) });
		s.net.up = false;
		await flush();
		expect(s.connection.link).toBe('offline');
		expect(s.invalidate).not.toHaveBeenCalled();

		s.net.up = true;
		s.browser.onLine = true;
		s.win.get('online')!();
		await flush();

		expect(s.connection.link).toBe('online');
		expect(s.invalidate).toHaveBeenCalledTimes(1);
		expect(s.asked.filter((u) => !u.startsWith('/api/ping'))).toEqual([
			'/__data.json?x-sveltekit-trailing-slash=1',
			'/',
			'/overlay/__data.json',
			'/friends/__data.json',
			'/more/__data.json'
		]);
		expect(document.documentElement.dataset.offline).toBeUndefined();
		expect(JSON.parse(s.stored.get(FRESH_KEY)!).at['/more/__data.json']).toBeGreaterThan(0);
		// It says so for a moment
		expect(s.connection.recovered).toBe(true);
		expect(s.connection.visible).toBe(true);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(s.connection.recovered).toBe(false);
		expect(s.connection.visible).toBe(false);
	});

	it('keeps trying, with longer waits, while nothing comes back', async () => {
		const s = setup({ cachedAt: Date.UTC(2026, 8, 28, 3, 0) });
		s.net.hang = true;
		// Each check gives up after 6s; the waits between are 5s, 10s, 20s, 30s, then a minute each time
		const at = async (seconds: number) => {
			await vi.advanceTimersByTimeAsync(seconds * 1000 - (Date.now() - start));
			return pings(s.asked);
		};
		const start = Date.now();
		expect(await at(6)).toBe(1);
		expect(s.connection.link).toBe('poor');
		expect(await at(10.9)).toBe(1);
		expect(await at(11)).toBe(2);
		expect(await at(26.9)).toBe(2);
		expect(await at(27)).toBe(3);
		expect(await at(52.9)).toBe(3);
		expect(await at(53)).toBe(4);
		expect(await at(88.9)).toBe(4);
		expect(await at(89)).toBe(5);
		expect(await at(154.9)).toBe(5);
		expect(await at(155)).toBe(6);

		// The try that started at 155s is stuck until 161s; the one after it, at 221s, gets through
		s.net.hang = false;
		await at(220.9);
		expect(s.connection.link).toBe('poor');
		await at(221);
		expect(s.connection.link).toBe('online');
	});

	it('tells offline from poor: no answer at all against an answer too slow', async () => {
		const gone = setup({ cachedAt: 1 });
		gone.net.up = false;
		await flush();
		expect(gone.connection.link).toBe('offline');
		gone.stop();

		const slow = setup({ cachedAt: 1 });
		slow.net.hang = true;
		await vi.advanceTimersByTimeAsync(6_000);
		expect(slow.connection.link).toBe('poor');
	});

	it('goes offline when the device says the connection is lost', async () => {
		const s = setup();
		s.net.up = false;
		s.win.get('offline')!();
		expect(s.connection.link).toBe('offline');
		await flush();
		expect(s.connection.link).toBe('offline');
	});

	it('keeps what a refresh got done when it fails partway', async () => {
		const s = setup({ cachedAt: 1 });
		s.fetcher.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/ping')) return new Response(null, { status: 204 });
			if (url.startsWith('/friends')) throw new TypeError('Failed to fetch');
			return new Response('{"type":"data","nodes":[]}');
		});
		await flush();
		expect(s.connection.link).toBe('offline');
		expect(s.invalidate).not.toHaveBeenCalled();
		// What was fetched before the failure is kept, so the next try starts where this one stopped
		const fresh = Object.keys(JSON.parse(s.stored.get(FRESH_KEY)!).at);
		expect(fresh).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/', '/overlay/__data.json']);
	});

	it('turns the refresh button around at least a moment, then says if it is still down', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.up = false;
		await flush();
		const before = pings(s.asked);

		s.connection.refresh();
		await vi.advanceTimersByTimeAsync(100);
		expect(s.connection.phase).toBe('checking');
		expect(pings(s.asked)).toBe(before + 1);
		await vi.advanceTimersByTimeAsync(700);
		expect(s.connection.phase).toBe('idle');
		expect(s.connection.notice?.text).toContain('まだ更新できません');
	});
});

describe('showing progress', () => {
	it('shows a bar only when a refresh takes a while, counting the tabs done', async () => {
		const s = setup({ cached: ['/'] });
		s.fetcher.mockImplementation(async (input: RequestInfo | URL) => {
			await new Promise((resolve) => setTimeout(resolve, 500));
			return new Response(String(input) === '/' ? '<html></html>' : '{"type":"data","nodes":[]}');
		});
		await vi.advanceTimersByTimeAsync(4_000); // the refresh starts
		expect(s.connection.phase).toBe('syncing');
		expect(s.connection.visible).toBe(false);

		await vi.advanceTimersByTimeAsync(1_300);
		expect(s.connection.visible).toBe(true);
		expect(s.connection.progress).toEqual({ done: 1, total: 4, label: '重ねる' });

		await vi.advanceTimersByTimeAsync(2_000);
		expect(s.connection.phase).toBe('idle');
		expect(s.connection.visible).toBe(false);
	});
});

describe('while the connection is down, what needs the server is off', () => {
	it('does not send a request that changes something, and says why', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.up = false;
		await flush();
		const original = vi.fn(async () => new Response('{}'));
		const fetch = s.connection.observe(original as unknown as typeof globalThis.fetch, ORIGIN);

		await expect(fetch('/courses/abc/files', { method: 'POST', body: 'x' })).rejects.toThrow(TypeError);
		expect(original).not.toHaveBeenCalled();
		expect(s.connection.notice?.text).toBe('オフラインのため、この操作はできません。つながってからお試しください。');

		// Reading is still up to the service worker
		await fetch('/friends/__data.json');
		expect(original).toHaveBeenCalledTimes(1);
	});

	it('word the reason by the state', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.hang = true;
		await vi.advanceTimersByTimeAsync(6_000);
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/x', { method: 'POST' }).catch(() => {});
		expect(s.connection.notice?.text).toContain('通信が不安定なため');
	});

	it('lets its own refresh requests and requests to other sites through', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.up = false;
		await flush();
		const original = vi.fn(async () => new Response('{}'));
		const fetch = s.connection.observe(original as unknown as typeof globalThis.fetch, ORIGIN);
		await fetch('/', { method: 'POST', headers: { [SYNC_HEADER]: '1' } });
		await fetch('https://elsewhere.test/x', { method: 'POST' });
		expect(original).toHaveBeenCalledTimes(2);
	});

	it('does not send a form, whether or not the page handles it', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.up = false;
		await flush();
		const submit = s.page.get('submit')!;

		const post = { target: new FakeForm('post'), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
		submit(post);
		expect(post.preventDefault).toHaveBeenCalled();
		expect(post.stopImmediatePropagation).toHaveBeenCalled();
		expect(s.connection.notice).not.toBeNull();

		// A search form only navigates; the navigation is what is guarded
		const get = { target: new FakeForm('get'), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
		submit(get);
		expect(get.preventDefault).not.toHaveBeenCalled();
	});

	it('lets forms through when online', () => {
		const s = setup();
		const post = { target: new FakeForm('post'), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
		s.page.get('submit')!(post);
		expect(post.preventDefault).not.toHaveBeenCalled();
	});

	it('stops a navigation to adding courses, or to a page that is not on the device', async () => {
		const s = setup({ cachedAt: 1, cached: ['/', '/friends', '/courses/search'] });
		s.net.up = false;
		await flush();
		const go = (path: string) => s.connection.guardNavigation(new URL(path, ORIGIN));

		expect(go('/friends')).toBe(true);
		expect(go('/')).toBe(true);
		expect(go('/courses/search?term=a&day=1&period=2')).toBe(false);
		expect(s.connection.notice?.text).toContain('授業の追加');
		expect(go('/overlay')).toBe(false);
		expect(s.connection.notice?.text).toContain('端末に保存されていません');
		expect(go('https://elsewhere.test/')).toBe(true);
	});

	it('stops links preparing their pages while the connection is bad, and starts again after', async () => {
		const s = setup({ synced: true });
		const preload = () => s.attributes.get('data-sveltekit-preload-data');
		expect(preload()).toBe('hover');
		s.connection.link = 'poor';
		expect(preload()).toBe('off');
		s.connection.link = 'offline';
		expect(preload()).toBe('off');
		s.connection.link = 'online';
		expect(preload()).toBe('hover');
	});

	it('counts a page opened since the copies were listed as on the device', async () => {
		const s = setup({ synced: true, cached: ['/', '/overlay', '/friends', '/more'] });
		await flush();
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/courses/abc/__data.json?x-sveltekit-invalidated=01');
		// The moment the connection is lost, before the copies are listed again
		s.net.hang = true;
		s.connection.link = 'offline';
		expect(s.connection.guardNavigation(new URL('/courses/abc', ORIGIN))).toBe(true);
		expect(s.connection.guardNavigation(new URL('/courses/other', ORIGIN))).toBe(false);
		// And once they are (the service worker has kept it)
		s.saved!.push('/courses/abc');
		s.connection.link = 'online';
		s.connection.link = 'poor';
		await flush();
		expect(s.connection.guardNavigation(new URL('/courses/abc', ORIGIN))).toBe(true);
	});

	it('stops laying someone else over in the overlay, which needs the server, unless that very view was kept', async () => {
		const s = setup({ cachedAt: 1, cached: ['/', '/overlay', '/overlay?with=u2&term=T', '/friends'] });
		s.net.up = false;
		await flush();
		const go = (path: string, from?: string) => s.connection.guardNavigation(new URL(path, ORIGIN), from);

		// A view kept before opens; another does not, and says why
		expect(go('/overlay?with=u2&term=T', '/overlay')).toBe(true);
		expect(s.connection.notice).toBeNull();
		expect(go('/overlay?with=u3&term=T', '/overlay')).toBe(false);
		expect(s.connection.notice?.text).toBe('オフラインのため、この表示にはサーバーの情報が必要です。つながってからお試しください。');
		expect(go('/overlay?term=T', '/overlay')).toBe(false);
	});

	it('shows another page from the copy of it, whatever the query', async () => {
		const s = setup({ cachedAt: 1, cached: ['/', '/overlay', '/courses/abc'] });
		s.net.up = false;
		await flush();
		const go = (path: string, from?: string) => s.connection.guardNavigation(new URL(path, ORIGIN), from);

		// Back from a course to the timetable of a term, or to the overlay as it was last left
		expect(go('/?term=T', '/courses/abc')).toBe(true);
		expect(go('/overlay?with=u9&term=T', '/')).toBe(true);
		// No copy of the page at all
		expect(go('/more?x=1', '/')).toBe(false);
		expect(s.connection.notice?.text).toContain('端末に保存されていません');
	});

	it('counts a view opened while online as kept, so it opens again offline', async () => {
		const s = setup({ synced: true, cached: ['/', '/overlay', '/friends', '/more'] });
		await flush();
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/overlay/__data.json?with=u3&term=T&x-sveltekit-invalidated=01');
		s.net.hang = true;
		s.connection.link = 'offline';
		expect(s.connection.guardNavigation(new URL('/overlay?with=u3&term=T', ORIGIN), '/overlay')).toBe(true);
		expect(s.connection.guardNavigation(new URL('/overlay?with=u4&term=T', ORIGIN), '/overlay')).toBe(false);
	});

	it('lets every navigation go when online', () => {
		const { connection } = setup({ cached: ['/'] });
		expect(connection.guardNavigation(new URL('/courses/search', ORIGIN))).toBe(true);
		expect(connection.notice).toBeNull();
	});

	it('clears the message after a few seconds', async () => {
		const s = setup({ cachedAt: 1 });
		s.net.up = false;
		await flush();
		s.connection.tell('x');
		expect(s.connection.notice?.text).toBe('x');
		await vi.advanceTimersByTimeAsync(4_000);
		expect(s.connection.notice).toBeNull();
	});
});

describe('watching what goes by', () => {
	it('takes an answer from a saved copy as a sign the connection is poor, and notes when it was saved', async () => {
		const s = setup({ synced: true });
		const savedAt = Date.UTC(2026, 8, 27, 3, 0);
		const fetch = s.connection.observe(
			(async () => new Response('{}', { headers: { [SAVED_AT_HEADER]: String(savedAt) } })) as typeof globalThis.fetch,
			ORIGIN
		);
		s.net.hang = true;
		await fetch('/friends/__data.json?x-sveltekit-invalidated=01');
		expect(s.connection.shownAt).toBe(savedAt);
		expect(s.connection.link).toBe('poor');
	});

	it('takes an answer from the server as fetched now', async () => {
		vi.setSystemTime(new Date('2026-09-29T03:30:00Z'));
		const s = setup();
		vi.setSystemTime(new Date('2026-09-29T04:00:00Z'));
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/friends/__data.json');
		expect(s.connection.shownAt).toBe(Date.parse('2026-09-29T04:00:00Z'));
	});

	it('ignores the requests of a refresh', async () => {
		const s = setup();
		const shown = s.connection.shownAt;
		vi.setSystemTime(Date.now() + 60_000);
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/friends/__data.json', { headers: { [SYNC_HEADER]: '1' } });
		expect(s.connection.shownAt).toBe(shown);
	});

	it('checks the connection when a request fails outright', async () => {
		const s = setup({ synced: true });
		s.net.up = false;
		const fetch = s.connection.observe(
			(async () => {
				throw new TypeError('Failed to fetch');
			}) as typeof globalThis.fetch,
			ORIGIN
		);
		await expect(fetch('/friends/__data.json')).rejects.toThrow(TypeError);
		await flush();
		expect(s.connection.link).toBe('offline');
	});

	it('does not take a request the app cancelled for a lost connection', async () => {
		const s = setup({ synced: true });
		const fetch = s.connection.observe(
			(async () => {
				throw new DOMException('aborted', 'AbortError');
			}) as typeof globalThis.fetch,
			ORIGIN
		);
		await fetch('/friends/__data.json').catch(() => {});
		await flush();
		expect(pings(s.asked)).toBe(0);
	});

	it('refreshes the copy of the timetable once things settle after a change', async () => {
		const s = setup({ synced: true });
		await flush();
		const fetch = s.connection.observe((async () => new Response('{}')) as typeof globalThis.fetch, ORIGIN);
		await fetch('/courses/new', { method: 'POST' });
		await fetch('/courses/new', { method: 'POST' });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(s.asked).toEqual([]);
		await vi.advanceTimersByTimeAsync(2_000);
		// Once, for both changes, and only the timetable
		expect(s.asked).toEqual(['/__data.json?x-sveltekit-trailing-slash=1', '/']);
	});
});
