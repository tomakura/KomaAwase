<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let termId = $state(data.terms[0]?.id);
	// A past year: always shown as it ended, with no class in session
	const clock = $derived(tokyoTime(data.now));
	const days = $derived(
		[...new Set([...data.days, ...data.courses.flatMap((c) => c.slots.map((s) => s.weekday))])].sort((a, b) => a - b)
	);
	const termCourses = $derived(data.courses.filter((c) => termId && c.termIds.includes(termId)));
</script>

<svelte:head>
	<title>{data.year}年度の時間割 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="{data.year}年度の時間割" back="/more/past" />
	<TermBar year={data.year} terms={data.terms} bind:termId />
	<TimetableGrid
		periods={data.periods}
		{days}
		courses={termCourses}
		{clock}
		termIsOn={false}
		showToday={false}
		courseHref={(id) => `/courses/${id}`}
	/>
	<UnscheduledCards courses={termCourses.filter((c) => c.slots.length === 0)} href={(id) => `/courses/${id}`} />
</div>
