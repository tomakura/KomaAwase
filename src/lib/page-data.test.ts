import { describe, expect, it } from 'vitest';
import { SAVED_AT_HEADER } from './offline';
import { pageData } from './page-data';

const ORIGIN = 'https://koma.test';
// The time on the device when a copy is shown
const NOW = 5_000;
// What SvelteKit sends for a page whose data has the server's clock as `now`: JSON whose
// first item lists where each value is. Index 1 holds the time.
const timed = (now: number, name: string) =>
	JSON.stringify({ type: 'data', nodes: [{ type: 'skip' }, { type: 'data', data: [{ now: 1, name: 2 }, now, name] }] });
const nowIn = (body: string) => JSON.parse(body).nodes[1].data[1];
const data = (path: string, mask = '01') => `${ORIGIN}${path.replace(/\/$/, '')}/__data.json?x-sveltekit-invalidated=${mask}`;

// A server that answers with whatever `pages` holds (by page path) and keeps a log of what it was asked.
// Comparing what comes back with what the server holds now tells a copy from a fresh answer.
function setup(pages: Record<string, string | undefined>) {
	const asked: string[] = [];
	const original = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), ORIGIN);
		asked.push(`${init?.method ?? 'GET'} ${url.pathname}`);
		if (init?.method === 'POST') return new Response('{}');
		const body = pages[url.pathname.replace(/\/__data\.json$/, '') || '/'];
		return body === undefined ? new Response('nope', { status: 500 }) : new Response(body, { headers: { 'content-type': 'application/json' } });
	}) as typeof fetch;
	let here = '/';
	let refreshed = 0;
	const kept = pageData(original, { origin: ORIGIN, path: () => here, now: () => NOW, refresh: () => refreshed++ });
	return {
		kept,
		asked,
		go: (path: string) => (here = path),
		refreshed: () => refreshed,
		/** What a page's data request gets */
		get: async (path: string, mask?: string) => (await kept.fetch(data(path, mask), {})).text(),
		/** A history navigation to the page, then its data request */
		back: async (path: string, mask?: string) => {
			kept.returningTo(path);
			return (await kept.fetch(data(path, mask), {})).text();
		}
	};
}

// Lets the copy being kept, and the check behind a copy, finish
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A page visited once (copy "A"), which the server now answers with "B"
async function visited() {
	const pages: Record<string, string | undefined> = { '/friends': 'A' };
	const s = setup(pages);
	await s.get('/friends');
	await settle();
	pages['/friends'] = 'B';
	return { s, pages };
}

describe('pageData', () => {
	it('never keeps a copy of the admin pages: going back asks the server and shows what it says', async () => {
		const pages: Record<string, string | undefined> = { '/admin/users': 'A' };
		const s = setup(pages);
		await s.get('/admin/users');
		await settle();
		// Signed in too long ago: the server no longer shows it
		pages['/admin/users'] = 'refused';
		expect(await s.back('/admin/users')).toBe('refused');
	});

	it('shows the copy when going back, and asks the server behind it', async () => {
		const { s } = await visited();
		s.asked.length = 0;
		expect(await s.back('/friends')).toBe('A');
		await settle();
		expect(s.asked).toEqual(['GET /friends/__data.json']);
	});

	it('refreshes the page when the server had something new, if it is still shown', async () => {
		const { s } = await visited();
		s.go('/friends');
		await s.back('/friends');
		await settle();
		expect(s.refreshed()).toBe(1);
		// What the next return shows
		expect(await s.back('/friends')).toBe('B');
	});

	it('does not refresh when the page was left before the server answered', async () => {
		const { s } = await visited();
		s.go('/more');
		await s.back('/friends');
		await settle();
		expect(s.refreshed()).toBe(0);
	});

	it('does not refresh when nothing changed', async () => {
		const { s, pages } = await visited();
		pages['/friends'] = 'A';
		s.go('/friends');
		await s.back('/friends');
		await settle();
		expect(s.refreshed()).toBe(0);
	});

	it('does not refresh when the server cannot answer', async () => {
		const { s, pages } = await visited();
		pages['/friends'] = undefined;
		s.go('/friends');
		expect(await s.back('/friends')).toBe('A');
		await settle();
		expect(s.refreshed()).toBe(0);
	});

	it("does not take a copy from the device for the server's answer: it may be older than the one shown", async () => {
		// The server answered "A" on the way in; behind the return, the service worker hands back its older copy
		const answers = [new Response('A'), new Response('old', { headers: { [SAVED_AT_HEADER]: '1' } })];
		let refreshed = 0;
		const kept = pageData((async () => answers.shift()!) as typeof fetch, { origin: ORIGIN, path: () => '/friends', now: () => NOW, refresh: () => refreshed++ });
		await kept.fetch(data('/friends'), {});
		await settle();
		kept.returningTo('/friends');
		expect(await (await kept.fetch(data('/friends'), {})).text()).toBe('A');
		await settle();
		expect(refreshed).toBe(0);
		kept.returningTo('/friends');
		expect(await (await kept.fetch(data('/friends'), {})).text()).toBe('A');
	});

	it('goes to the server for a visit that is not a return', async () => {
		const { s } = await visited();
		expect(await s.get('/friends')).toBe('B');
	});

	it('goes to the server when returning to another page than the copy', async () => {
		const { s } = await visited();
		s.kept.returningTo('/more');
		expect(await s.get('/friends')).toBe('B');
	});

	it('goes to the server when the layout or page is to be loaded differently', async () => {
		const { s } = await visited();
		expect(await s.back('/friends', '11')).toBe('B');
	});

	it('uses a copy once per return', async () => {
		const pages: Record<string, string> = { '/friends': 'A' };
		const s = setup(pages);
		await s.get('/friends');
		await settle();

		// The server still says "A" when checked behind the copy, so the copy stays "A"
		expect(await s.back('/friends')).toBe('A');
		pages['/friends'] = 'B';
		expect(await s.get('/friends')).toBe('B');
	});

	it('drops every copy when a request changes something', async () => {
		const { s } = await visited();
		await s.kept.fetch('/friends?/accept', { method: 'POST' });
		expect(await s.back('/friends')).toBe('B');
	});

	it('does not keep what was read before a change', async () => {
		const pages: Record<string, string> = { '/friends': 'A' };
		const s = setup(pages);
		const reading = s.kept.fetch(data('/friends'), {});
		await s.kept.fetch('/friends?/accept', { method: 'POST' });
		await (await reading).text();
		await settle();

		pages['/friends'] = 'B';
		expect(await s.back('/friends')).toBe('B');
	});

	it('does not refresh when only the clock in the data differs', async () => {
		const pages: Record<string, string> = { '/': timed(1_000, 'home') };
		const s = setup(pages);
		await s.get('/');
		await settle();

		pages['/'] = timed(2_000, 'home');
		s.go('/');
		await s.back('/');
		await settle();
		expect(s.refreshed()).toBe(0);
	});

	it('refreshes when something besides the clock differs', async () => {
		const pages: Record<string, string> = { '/': timed(1_000, 'home') };
		const s = setup(pages);
		await s.get('/');
		await settle();

		pages['/'] = timed(2_000, 'changed');
		s.go('/');
		await s.back('/');
		await settle();
		expect(s.refreshed()).toBe(1);
	});

	it('shows a copy with the time on the device in place of the old clock', async () => {
		const pages: Record<string, string> = { '/': timed(1_000, 'home') };
		const s = setup(pages);
		await s.get('/');
		await settle();

		const body = await s.back('/');
		expect(nowIn(body)).toBe(NOW);
		expect(JSON.parse(body).nodes[1].data[2]).toBe('home');
	});

	it('leaves a `now` that is not a time as it is', async () => {
		const other = JSON.stringify({ type: 'data', nodes: [{ type: 'data', data: [{ now: 1 }, 'tomorrow'] }] });
		const s = setup({ '/': other });
		await s.get('/');
		await settle();

		expect(await s.back('/')).toBe(other);
	});

	it('does not keep redirects or failed answers', async () => {
		const pages: Record<string, string | undefined> = { '/login': '{"type":"redirect","location":"/"}', '/missing': undefined };
		const s = setup(pages);
		await s.get('/login');
		await s.get('/missing');
		await settle();

		pages['/login'] = 'LOGIN';
		pages['/missing'] = 'FOUND';
		expect(await s.back('/login')).toBe('LOGIN');
		expect(await s.back('/missing')).toBe('FOUND');
	});

	it('leaves other requests alone', async () => {
		const s = setup({});
		s.asked.length = 0;
		await s.kept.fetch(`${ORIGIN}/icons/x?v=1`, {});
		await s.kept.fetch('https://elsewhere.test/friends/__data.json', {});
		expect(s.asked).toEqual(['GET /icons/x', 'GET /friends/__data.json']);
	});

	it('reads the page the app opened on', async () => {
		const pages: Record<string, string> = { '/friends': 'A' };
		const s = setup(pages);
		await s.kept.read(`${ORIGIN}/friends#top`);
		await settle();

		pages['/friends'] = 'B';
		expect(await s.back('/friends')).toBe('A');
	});

	it('reads the top page as /__data.json', async () => {
		const pages: Record<string, string> = { '/': 'HOME' };
		const s = setup(pages);
		await s.kept.read(`${ORIGIN}/`);
		await settle();

		pages['/'] = 'NEW';
		s.kept.returningTo('/');
		// The address SvelteKit asks for when going back to the top page
		const ask = `${ORIGIN}/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=01`;
		expect(await (await s.kept.fetch(ask, {})).text()).toBe('HOME');
	});
});
