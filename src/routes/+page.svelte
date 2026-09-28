<script lang="ts">
	import { replaceState } from '$app/navigation';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import { courseColor, courseHref, deliveryLabel, timetableHref } from '$lib/courses';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	// Open on the term in the URL (coming back from a course), else the term that is on now,
	// or during a break the next one to start.
	function initialTerm() {
		const today = tokyoTime(data.now).date;
		const term =
			data.terms.find((t) => t.id === data.termParam) ??
			data.terms.find((t) => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate) ??
			data.terms.find((t) => t.startDate && today < t.startDate) ??
			data.terms[0];
		return term?.id;
	}

	let termId = $state(initialTerm());
	const term = $derived(data.terms.find((t) => t.id === termId));

	function selectTerm(id: string) {
		termId = id;
		replaceState(timetableHref(id), {});
	}

	// Starts at the server's time so hydration matches, then follows the browser's clock.
	// svelte-ignore state_referenced_locally
	let now = $state(data.now);
	$effect(() => {
		const tick = () => (now = Date.now());
		tick();
		const timer = setInterval(tick, 30_000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', tick);
		};
	});
	const clock = $derived(tokyoTime(now));
	// Classes are only on in a term that includes today; a term without dates always is.
	const termIsOn = $derived(
		!!term &&
			(!term.startDate || !term.endDate || (term.startDate <= clock.date && clock.date <= term.endDate))
	);

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
		<!-- The export screen comes later. -->
		<button class="icon-button" type="button" aria-label="画像で書き出す" disabled>
			<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
			</svg>
		</button>
	</header>

	<main>
		<div class="term-bar">
			<div class="term-title">
				<span class="year">{data.year}年度</span>
				<span class="group">{term?.groupName ?? term?.name ?? ''}</span>
			</div>
			<div class="tabs" role="group" aria-label="学期">
				{#each data.terms as t (t.id)}
					<button type="button" aria-pressed={t.id === termId} onclick={() => selectTerm(t.id)}>
						{t.name}
					</button>
				{/each}
			</div>
		</div>

		<TimetableGrid
			periods={data.periods}
			{days}
			courses={termCourses}
			{clock}
			{termIsOn}
			slotHref={(day, period) => `/courses/search?term=${termId}&day=${day}&period=${period}`}
			courseHref={(id) => courseHref(id, termId ?? null)}
		/>

		{#if unscheduled.length}
			<section class="unscheduled">
				<h2>曜日・時限なし</h2>
				<div class="cards">
					{#each unscheduled as course (course.id)}
						{@const label = deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo)}
						<a class="card" href={courseHref(course.id, termId ?? null)} style:--c={courseColor(course.color)}>
							<span>{#each course.titleParts as part, k}{#if k}<wbr />{/if}{part}{/each}</span>
							{#if label}<span class="delivery">{label}</span>{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}
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
		padding: 0;
		border: none;
		border-radius: 12px;
		background: none;
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

	.term-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 16px 12px;
	}

	.term-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.year {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.group {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 17px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 3px;
		background: var(--slot);
		border-radius: 12px;
	}

	.tabs button {
		min-width: 44px;
		height: 36px;
		padding: 0 8px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.tabs button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}

	.unscheduled {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 12px 0;
	}

	h2 {
		margin: 0;
		padding-left: 2px;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	/* The label moves under a title that needs the whole width. */
	.card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 7px 8px;
		border-radius: 8px;
		background: var(--c);
		color: var(--ink);
		font-size: 12px;
		font-weight: 700;
		text-decoration: none;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.delivery {
		flex-shrink: 0;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--surface);
		font-size: 10px;
		font-weight: 400;
		white-space: nowrap;
	}
</style>
