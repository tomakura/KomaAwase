import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYNC_HEADER } from './offline';
import { SYNC_STEPS, TIMETABLE_STEPS, needsServer, openableOffline, runSync, savedAtLabel, type SyncProgress } from './sync';

afterEach(() => vi.useRealTimers());

// A server that answers each URL with what `routes` holds (a Response, or a function of the request)
function server(routes: Record<string, Response | (() => Response | Promise<Response>)>) {
	const asked: { url: string; headers: Headers }[] = [];
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		asked.push({ url, headers: new Headers(init?.headers) });
		const route = routes[url];
		if (!route) return new Response('nope', { status: 404 });
		return typeof route === 'function' ? route() : route.clone();
	}) as typeof fetch;
	return { fetcher, asked };
}

const page = (body = '{"type":"data","nodes":[]}') => new Response(body, { headers: { 'content-type': 'application/json' } });
const allPages = () => ({
	'/__data.json?x-sveltekit-trailing-slash=1': page(),
	'/': new Response('<html></html>'),
	'/overlay/__data.json': page(),
	'/friends/__data.json': page(),
	'/more/__data.json': page()
});

describe('runSync', () => {
	it('fetches the four tabs in order and reports how far it got before each', async () => {
		const { fetcher, asked } = server(allPages());
		const seen: SyncProgress[] = [];
		const result = await runSync(SYNC_STEPS, { fetch: fetcher, timeout: 1000, progress: (p) => seen.push(p) });
		expect(result).toEqual({ ok: true });
		expect(asked.map((a) => a.url)).toEqual([
			'/__data.json?x-sveltekit-trailing-slash=1',
			'/',
			'/overlay/__data.json',
			'/friends/__data.json',
			'/more/__data.json'
		]);
		expect(seen.map((p) => `${p.done}/${p.total} ${p.label}`)).toEqual([
			'0/4 時間割',
			'1/4 重ねる',
			'2/4 友だち',
			'3/4 その他',
			'4/4 '
		]);
	});

	it('marks its requests so the service worker skips the saved copy, and asks for HTML for the top page', async () => {
		const { fetcher, asked } = server(allPages());
		await runSync(TIMETABLE_STEPS, { fetch: fetcher, timeout: 1000 });
		expect(asked).toHaveLength(2);
		expect(asked.every((a) => a.headers.get(SYNC_HEADER) === '1')).toBe(true);
		expect(asked[0].headers.get('accept')).toBeNull();
		expect(asked[1].headers.get('accept')).toBe('text/html');
	});

	it('stops at the first failure instead of trying the rest', async () => {
		const { fetcher, asked } = server({ ...allPages(), '/overlay/__data.json': () => new Response('x', { status: 500 }) });
		expect(await runSync(SYNC_STEPS, { fetch: fetcher, timeout: 1000 })).toEqual({ ok: false, reason: 'error' });
		expect(asked.map((a) => a.url)).not.toContain('/friends/__data.json');
	});

	it('says offline when a request cannot be made', async () => {
		const fetcher = (async () => {
			throw new TypeError('Failed to fetch');
		}) as typeof fetch;
		expect(await runSync(SYNC_STEPS, { fetch: fetcher, timeout: 1000 })).toEqual({ ok: false, reason: 'offline' });
	});

	it('says slow when a request gets no answer in time', async () => {
		vi.useFakeTimers();
		const fetcher = ((_: RequestInfo | URL, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			})) as typeof fetch;
		const result = runSync(SYNC_STEPS, { fetch: fetcher, timeout: 15_000 });
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await result).toEqual({ ok: false, reason: 'slow' });
	});

	it('counts an answer that stalls while it is being read as slow too', async () => {
		vi.useFakeTimers();
		const fetcher = ((_: RequestInfo | URL, init?: RequestInit) => {
			const stream = new ReadableStream({
				start(controller) {
					init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
				}
			});
			return Promise.resolve(new Response(stream));
		}) as typeof fetch;
		const result = runSync(SYNC_STEPS, { fetch: fetcher, timeout: 15_000 });
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await result).toEqual({ ok: false, reason: 'slow' });
	});

	it('notices a signed-out user, whose data request is answered with a redirect', async () => {
		const routes = { ...allPages(), '/__data.json?x-sveltekit-trailing-slash=1': page('{"type":"redirect","location":"/login"}') };
		expect(await runSync(SYNC_STEPS, { fetch: server(routes).fetcher, timeout: 1000 })).toEqual({ ok: false, reason: 'signed-out' });
	});

	it('notices a signed-out user on the HTML page, which redirects', async () => {
		const redirected = new Response('<html></html>');
		Object.defineProperty(redirected, 'redirected', { value: true });
		const routes = { ...allPages(), '/': () => redirected };
		expect(await runSync(SYNC_STEPS, { fetch: server(routes).fetcher, timeout: 1000 })).toEqual({ ok: false, reason: 'signed-out' });
	});
});

describe('needsServer', () => {
	it('is true for adding courses, the screenshot reader and adding people', () => {
		for (const path of ['/courses/search', '/courses/new', '/import', '/import/abc', '/friends/add', '/groups/new', '/courses/search/']) {
			expect(needsServer(path), path).toBe(true);
		}
	});

	it('is false for viewing', () => {
		for (const path of ['/', '/overlay', '/friends', '/friends/abc', '/courses/abc', '/courses/abc/edit', '/more', '/more/nickname', '/export']) {
			expect(needsServer(path), path).toBe(false);
		}
	});
});

describe('openableOffline', () => {
	const cached = new Set(['/', '/friends', '/courses/abc']);

	it('is true for pages on the device', () => {
		expect(openableOffline('/', cached)).toBe(true);
		expect(openableOffline('/friends/', cached)).toBe(true);
		expect(openableOffline('/courses/abc', cached)).toBe(true);
	});

	it('is false for pages not on the device', () => {
		expect(openableOffline('/overlay', cached)).toBe(false);
		expect(openableOffline('/courses/other', cached)).toBe(false);
	});

	it('is false for pages that need the server, even when a copy is there', () => {
		expect(openableOffline('/courses/search', new Set([...cached, '/courses/search']))).toBe(false);
	});

	it('is true for pages with nothing to load', () => {
		expect(openableOffline('/install', cached)).toBe(true);
		expect(openableOffline('/privacy', cached)).toBe(true);
	});

	it('leaves it to the navigation when the copies cannot be listed', () => {
		expect(openableOffline('/overlay', null)).toBe(true);
		expect(openableOffline('/courses/search', null)).toBe(false);
	});
});

describe('savedAtLabel', () => {
	// 2026-09-29 12:30 in Japan
	const now = Date.UTC(2026, 8, 29, 3, 30);

	it('says today, yesterday, or the date', () => {
		expect(savedAtLabel(Date.UTC(2026, 8, 29, 0, 5), now)).toBe('今日 9:05');
		expect(savedAtLabel(Date.UTC(2026, 8, 28, 12, 40), now)).toBe('昨日 21:40');
		expect(savedAtLabel(Date.UTC(2026, 8, 27, 3, 30), now)).toBe('9/27 12:30');
	});

	it('counts days in Japan time, not UTC', () => {
		// 00:10 on the 29th in Japan is still the 28th in UTC
		expect(savedAtLabel(Date.UTC(2026, 8, 28, 15, 10), now)).toBe('今日 0:10');
	});
});
