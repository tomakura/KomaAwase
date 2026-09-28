<script lang="ts">
	import { replaceState } from '$app/navigation';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import { liveClock } from '$lib/clock.svelte';
	import { courseHref, timetableHref } from '$lib/courses';
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
	const selectTerm = (id: string) => replaceState(timetableHref(id), {});

	const clock = $derived(time.clock);
	const on = $derived(termIsOn(term, clock.date));

	const days = $derived(data.days.toSorted((a, b) => a - b));
	const termCourses = $derived(data.courses.filter((c) => termId && c.termIds.includes(termId)));
	const unscheduled = $derived(termCourses.filter((c) => c.slots.length === 0));
</script>

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

		<TimetableGrid
			periods={data.periods}
			{days}
			courses={termCourses}
			{clock}
			termIsOn={on}
			slotHref={(day, period) => `/courses/search?term=${termId}&day=${day}&period=${period}`}
			courseHref={(id) => courseHref(id, termId ?? null)}
		/>

		<UnscheduledCards courses={unscheduled} href={(id) => courseHref(id, termId ?? null)} />
	</main>

	<BottomNav current="timetable" />
</div>

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
