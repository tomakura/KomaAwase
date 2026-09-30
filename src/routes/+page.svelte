<script lang="ts">
	import { goto, preloadData, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import CourseDetail from '$lib/components/CourseDetail.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import { liveClock } from '$lib/clock.svelte';
	import { courseHref, timetableHref } from '$lib/courses';
	import { motion } from '$lib/motion';
	import { currentTerm, termIsOn } from '$lib/terms';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const time = liveClock(data.now);
	// Open on the term in the URL (coming back from a course), else the term that is on now,
	// or during a break the next one to start.
	// svelte-ignore state_referenced_locally
	let termId = $state(
		(data.terms.find((t) => t.id === data.termParam) ?? currentTerm(data.terms, tokyoTime(data.now).date))?.id
	);
	const term = $derived(data.terms.find((t) => t.id === termId));
	// Changing the term brings its cells in one after another (not the first time it opens)
	let staggered = $state(false);
	const selectTerm = (id: string) => {
		staggered = true;
		replaceState(timetableHref(id), {});
	};

	const clock = $derived(time.clock);
	const on = $derived(termIsOn(term, clock.date));

	const days = $derived(data.days.toSorted((a, b) => a - b));
	const termCourses = $derived(data.courses.filter((c) => termId && c.termIds.includes(termId)));
	const unscheduled = $derived(termCourses.filter((c) => c.slots.length === 0));

	// A course opens over the timetable, which stays as it is behind it (its address is the
	// course's, so reloading or sharing it opens the course's own page). Anything that can't
	// be done that way, such as a click with a modifier key or a course that can't be loaded,
	// goes the usual way.
	const COURSE = /^\/courses\/(?!new$|search$)[^/]+$/;
	async function openCourse(e: MouseEvent) {
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		const link = (e.target as Element | null)?.closest?.('a');
		if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
		const url = new URL(link.href, location.href);
		if (url.origin !== location.origin || !COURSE.test(url.pathname)) return;
		e.preventDefault();
		const href = url.pathname + url.search;
		try {
			const result = await preloadData(href);
			if (result.type === 'loaded' && result.status === 200) return pushState(href, { course: result.data as NonNullable<typeof page.state.course> });
		} catch {
			// Fall through to the page itself
		}
		void goto(href);
	}
	// The timetable reloading (back in the app after a while, say) reads an open course again too
	let loadedOnce = false;
	$effect(() => {
		void data;
		if (!loadedOnce) return void (loadedOnce = true);
		if (untrack(() => page.state.course)) void refreshCourse();
	});
	// After a change made there (a memo added, say), the course as it is now
	async function refreshCourse() {
		// The browser's address is the course's (page.url stays the timetable's). A made-up
		// parameter makes the answer a new one, not the one kept from opening it.
		const href = `${location.pathname}${location.search}${location.search ? '&' : '?'}at=${Date.now()}`;
		try {
			const result = await preloadData(href);
			if (result.type === 'loaded' && result.status === 200) replaceState('', { course: result.data as NonNullable<typeof page.state.course> });
		} catch {
			// The copy shown stays
		}
	}
</script>

<svelte:window onclickcapture={openCourse} />

<svelte:head>
	<title>時間割 · コマあわせ</title>
</svelte:head>

<div class="screen">
	<header>
		<div class="brand">
			<svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
				<rect x="4" y="8" width="26" height="26" rx="7" fill="var(--shu)" />
				<rect x="18" y="14" width="26" height="26" rx="7" fill="var(--ai)" class="overlap" />
			</svg>
			<span>コマあわせ</span>
		</div>
		<a class="icon-button" href="/export{termId ? `?term=${encodeURIComponent(termId)}` : ''}" aria-label="画像で書き出す">
			<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
			</svg>
		</a>
	</header>

	<main>
		{#if data.imported}
			<a class="notice" class:failed={data.imported.status !== 'done'} href="/import/{data.imported.id}">
				<span>
					<b>{data.imported.status === 'done' ? 'スクショの読み取りが終わりました' : 'スクショを読み取れませんでした'}</b>
					{data.imported.status === 'done' ? '内容を見直して、時間割に追加します' : 'くわしくはこちら'}
				</span>
				<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</a>
		{/if}
		<TermBar year={data.year} terms={data.terms} bind:termId onchange={selectTerm} />

		<!-- A new timetable: the ways to fill it, up front. Searching and importing need an
			 enrollment check; where there is none to be had, only typing in is offered. -->
		{#if !data.courses.length && !data.imported}
			<section class="start">
				{#if data.access === 'ok'}
					<h2>授業を登録する</h2>
					<a class="way primary" href="/import?back=/{termId ? `&term=${encodeURIComponent(termId)}` : ''}">
						<Icon name="image" size={22} />
						<span><b>スクショから読み込む</b>ほかのアプリの時間割をまとめて登録</span>
					</a>
					<a class="way" href="/courses/search{termId ? `?term=${encodeURIComponent(termId)}` : ''}">
						<Icon name="search" size={22} />
						<span><b>授業をさがす</b>同じ大学の人が登録した授業から選ぶ</span>
					</a>
				{:else}
					<h2>授業を登録する</h2>
					{#if data.access === 'need-verify'}
						<div class="lock">
							<b>在籍確認をすると使えます</b>
							<ul>
								<li>授業をさがす（同じ大学の人の授業から選ぶ）</li>
								<li>スクショから読み込む</li>
							</ul>
							<a class="btn btn-primary" href="/more/verify">在籍確認する</a>
						</div>
					{/if}
					<a class="way" href="/courses/new{termId ? `?term=${encodeURIComponent(termId)}` : ''}">
						<Icon name="edit" size={22} />
						<span><b>自分で入力する</b></span>
					</a>
				{/if}
				<p class="ui-note">下の時間割の空いているコマを押しても追加できます。</p>
			</section>
		{/if}

		<!-- The other term's classes fade in -->
		{#key termId}
			<div>
				<TimetableGrid
					stagger={staggered}
					periods={data.periods}
					{days}
					courses={termCourses}
					{clock}
					termIsOn={on}
					termStart={term?.startDate}
					slotHref={(day, period) => `/courses/search?term=${termId}&day=${day}&period=${period}`}
					courseHref={(id) => courseHref(id, termId ?? null)}
				/>

				<div in:fade={motion(200)}>
					<UnscheduledCards courses={unscheduled} href={(id) => courseHref(id, termId ?? null)} />
				</div>
			</div>
		{/key}
	</main>

	<BottomNav current="timetable" />
</div>

{#if page.state.course}
	<div class="course-over" data-swipe-scroll in:fade={motion(200)} out:fade={motion(240)}>
		<CourseDetail data={page.state.course} form={page.form} close={() => history.back()} refresh={refreshCourse} />
	</div>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 6px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 18px;
		letter-spacing: 0.02em;
	}

	.overlap {
		mix-blend-mode: var(--logo-blend);
	}

	.course-over {
		position: fixed;
		inset: var(--bar-h, 0px) 0 0;
		z-index: 30;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: color-mix(in srgb, var(--scrim), transparent 30%);
	}

	.start {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 4px 16px 12px;
	}

	.start h2 {
		margin: 0 0 2px;
		font-size: 15px;
		font-weight: 700;
	}

	.way {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}

	.lock {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.lock b {
		font-size: 14px;
	}

	.lock ul {
		margin: 0;
		padding-left: 20px;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.lock .btn {
		margin-top: 4px;
		text-decoration: none;
	}

	.way.primary {
		border-color: var(--ink);
	}

	.way span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.way b {
		font-size: 14px;
		color: var(--ink);
	}

	.icon-button {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		color: var(--ink);
	}

	.icon-button svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	main {
		padding-bottom: 20px;
	}

	.notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 4px 16px 10px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--course-green);
		color: var(--ink);
		font-size: 12px;
		text-decoration: none;
	}

	.notice.failed {
		background: var(--course-orange);
	}

	.notice span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.notice b {
		font-size: 13px;
	}

	.notice svg {
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
