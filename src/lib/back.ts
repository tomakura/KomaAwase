// Going back to the page before, the way the browser's back does, instead of opening it again.
// A back link (marked data-back) or a sheet pulled down names the page it leads to; when that is
// the entry just before this one in the history, the browser goes back to it. The page then
// shows at once as it was left (src/lib/page-data.ts) and needs nothing from the server, which
// on a bad connection may never answer. Anything else opens the page as before.
//
// The entries are told apart by the number SvelteKit gives each one in history.state, so an
// entry added without a page change (a course opened over the timetable) is counted too.

const INDEX = 'sveltekit:history';

type Entry = { index: number; path: string };

const trimmed = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

export function backTrail(env: { index: () => number | undefined; path: () => string }) {
	// The entries before this one that are known, oldest first
	let trail: Entry[] = [];

	return {
		/** For afterNavigate: the page now shown, at the entry it is at */
		arrived() {
			const index = env.index();
			if (index === undefined) return void (trail = []);
			trail = trail.filter((e) => e.index < index);
			trail.push({ index, path: trimmed(env.path()) });
		},
		/** Whether going back reaches `href` (by its path: the page as it was left, whatever its query) */
		leadsTo(href: string, origin: string) {
			const index = env.index();
			if (index === undefined) return false;
			const url = new URL(href, origin);
			if (url.origin !== origin) return false;
			const before = trail.find((e) => e.index === index - 1);
			return !!before && before.path === trimmed(url.pathname);
		}
	};
}

const trail =
	typeof window === 'undefined'
		? null
		: backTrail({
				index: () => {
					const n = (history.state as Record<string, unknown> | null)?.[INDEX];
					return typeof n === 'number' ? n : undefined;
				},
				path: () => location.pathname
			});

export const arrived = () => trail?.arrived();

/** Goes back when that reaches `href`; false when it doesn't, and nothing was done */
export function goBack(href: string) {
	if (!trail?.leadsTo(href, location.origin)) return false;
	history.back();
	return true;
}

/** For a click anywhere: a back link (data-back) that the browser's back reaches */
export function backLink(e: MouseEvent) {
	if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
	const link = (e.target as Element | null)?.closest?.('a[data-back]');
	if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self')) return;
	if (goBack(link.href)) e.preventDefault();
}
