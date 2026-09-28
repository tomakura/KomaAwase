<script lang="ts">
	import { replaceState } from '$app/navigation';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import { courseHref, timetableHref } from '$lib/courses';
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

	const selectTerm = (id: string) => replaceState(timetableHref(id), {});

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
		<TermBar year={data.year} terms={data.terms} bind:termId onchange={selectTerm} />

		<TimetableGrid
			periods={data.periods}
			{days}
			courses={termCourses}
			{clock}
			{termIsOn}
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
</style>
