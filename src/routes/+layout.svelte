<script lang="ts">
	import '../app.css';
	import { invalidateAll, onNavigate } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children } = $props();

	// Back in the app after a while (it stays open in the background on a phone): show what
	// changed meanwhile, such as a friend's timetable or a finished screenshot.
	const STALE_AFTER = 60 * 1000;
	$effect(() => {
		let hiddenAt = 0;
		const changed = () => {
			if (document.hidden) hiddenAt = Date.now();
			else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER) invalidateAll();
		};
		document.addEventListener('visibilitychange', changed);
		return () => document.removeEventListener('visibilitychange', changed);
	});

	// Friend requests waiting, on the app's icon on the home screen. A push sets it while the
	// app is closed (src/service-worker.ts); this keeps it right once the app is open.
	$effect(() => {
		const n = data.pendingRequests;
		if (!('setAppBadge' in navigator)) return;
		(n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
	});

	// How a navigation moves: between the tabs it fades, deeper pages come in from the right
	// and go back out to it, and a course opens as a sheet from the bottom (see app.css).
	const TABS = ['/', '/overlay', '/friends', '/more'];
	const COURSE = /^\/courses\/(?!new$|search$)[^/]+$/;
	const depth = (path: string) => path.split('/').filter(Boolean).length;

	function motion(from: string, to: string) {
		if (COURSE.test(to) && !from.startsWith('/courses/')) return 'sheet-open';
		if (COURSE.test(from) && !to.startsWith('/courses/')) return 'sheet-close';
		if (TABS.includes(from) && TABS.includes(to)) return 'fade';
		if (depth(to) > depth(from)) return 'forward';
		if (depth(to) < depth(from)) return 'back';
		return 'fade';
	}

	onNavigate((navigation) => {
		const from = navigation.from?.url.pathname;
		const to = navigation.to?.url.pathname;
		// The same page with other options (another term, say) changes in place
		if (!from || !to || from === to || !document.startViewTransition) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const root = document.documentElement;
		root.dataset.nav = motion(from, to);
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => delete root.dataset.nav);
		});
	});
</script>

<svelte:head>
	<title>コマあわせ</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
