<script lang="ts">
	import '../app.css';
	import { beforeNavigate, invalidateAll, onNavigate } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import favicon from '$lib/assets/favicon.svg';
	import NotifyPrompt from '$lib/components/NotifyPrompt.svelte';
	import VerifyPrompt from '$lib/components/VerifyPrompt.svelte';
	import WarningScreen from '$lib/components/WarningScreen.svelte';
	import { version } from '$app/environment';
	import ConnectionBar from '$lib/components/ConnectionBar.svelte';
	import NavigationWait from '$lib/components/NavigationWait.svelte';
	import { connection } from '$lib/connection.svelte';
	import { pageData } from '$lib/page-data';

	let { data, children } = $props();
	// The enrollment prompt's stage once closed; until then it holds back the notification prompt
	let verifyDismissed = $state(-1);

	// A warning is shown over everything until 理解しました is pressed. Ones answered here are kept,
	// so a copy of a page from before it was answered (going back) doesn't bring it back.
	const answered = new SvelteSet<string>();
	const warning = $derived(data.warning && !answered.has(data.warning.id) ? data.warning : null);

	async function acknowledge(id: string) {
		const res = await fetch('/api/warning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
		if (!res.ok) return;
		answered.add(id);
		await invalidateAll();
	}

	// Back in the app after a while (it stays open in the background on a phone): show what
	// changed meanwhile, such as a friend's timetable or a finished screenshot.
	const STALE_AFTER = 60 * 1000;
	$effect(() => {
		let hiddenAt = 0;
		const changed = () => {
			if (document.hidden) hiddenAt = Date.now();
			// Not while the connection is down: the copy on screen is all there is (src/lib/connection.svelte.ts
			// loads it again once it's back)
			else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER && !connection.blocked) invalidateAll();
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

	// Going back shows the page as it was left and updates it after (see src/lib/page-data.ts).
	// A tab the app opened on has no copy yet, so one is read a moment after it opens.
	let pages: ReturnType<typeof pageData> | undefined;
	// The browser's own fetch, for the app's requests about the connection (they aren't pages
	// to keep copies of in memory)
	let browserFetch: typeof fetch | undefined;
	$effect(() => {
		const original = window.fetch;
		browserFetch = original;
		// The connection watches what goes by: how old an answer is, and whether requests fail
		const kept = pageData(connection.observe(original, location.origin), {
			origin: location.origin,
			path: () => location.pathname,
			now: Date.now,
			refresh: () => void invalidateAll()
		});
		window.fetch = kept.fetch;
		pages = kept;
		const opened = location.href;
		const seed = TABS.includes(location.pathname) ? setTimeout(() => kept.read(opened), 2000) : undefined;
		return () => {
			clearTimeout(seed);
			window.fetch = original;
			pages = undefined;
			browserFetch = undefined;
		};
	});
	beforeNavigate(({ type, to }) => pages?.returningTo(type === 'popstate' && to ? to.url.pathname : null));

	// Offline or on a poor connection: keeps the timetable on screen, refreshes the copies of the
	// tabs when the server answers, and switches off what needs it (src/lib/connection.svelte.ts).
	$effect(() => {
		const signedIn = data.signedIn;
		return connection.start({
			origin: location.origin,
			path: location.pathname,
			version,
			controlled: () => !!navigator.serviceWorker?.controller,
			fetch: (...args) => (browserFetch ?? fetch)(...args),
			invalidate: () => invalidateAll(),
			signedIn
		});
	});
	// A page that can't be opened now stays where it is, with the reason (not a reload into the offline page)
	beforeNavigate((navigation) => {
		if (navigation.willUnload || !navigation.to) return;
		if (!connection.guardNavigation(navigation.to.url, navigation.from?.url.pathname)) navigation.cancel();
	});

	// How a navigation moves: between the tabs it fades, deeper pages come in from the right
	// and go back out to it, and a course opens as a sheet from the bottom (see app.css).
	const TABS = ['/', '/plans', '/friends', '/more'];
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

<ConnectionBar />
<NavigationWait />
<!-- Behind a warning nothing can be reached -->
<div style="display: contents" inert={!!warning}>{@render children()}</div>
{#if warning}
	<WarningScreen id={warning.id} body={warning.body} onack={() => acknowledge(warning.id)} />
{/if}

<VerifyPrompt prompt={data.verifyPrompt} setupDone={data.setupDone} bind:dismissed={verifyDismissed} />
<!-- One screen at a time: the notification one waits while the enrollment one is due -->
<NotifyPrompt signedIn={data.signedIn} setupDone={data.setupDone} publicKey={data.pushKey} hold={!!data.verifyPrompt && data.verifyPrompt.stage !== verifyDismissed} />
