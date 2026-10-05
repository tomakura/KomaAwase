<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import { liveClock } from '$lib/clock.svelte';
	import { SHARE_CHOICES } from '$lib/sharing';
	import { currentTerm, termIsOn } from '$lib/terms';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const time = liveClock(data.now);
	// svelte-ignore state_referenced_locally
	let termId = $state(currentTerm(data.terms, tokyoTime(data.now).date)?.id);
	const term = $derived(data.terms.find((t) => t.id === termId));
	const days = $derived(
		[...new Set([...data.days, ...data.courses.flatMap((c) => c.slots.map((s) => s.weekday))])].sort((a, b) => a - b)
	);
	const termCourses = $derived(data.courses.filter((c) => termId && c.termIds.includes(termId)));
	const audience = $derived(data.audiences.find((a) => a.id === data.as)?.name ?? '');
	const label = $derived(SHARE_CHOICES.find((c) => c.id === data.share)?.label ?? '');
</script>

<svelte:head>
	<title>相手からの見え方 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="相手からの見え方" back="/friends/sharing" />

	<div class="top">
		<label class="field">
			だれから
			<select value={data.as} onchange={(e) => goto(`?as=${e.currentTarget.value}`, { replaceState: true })}>
				{#each data.audiences as a (a.id)}
					<option value={a.id}>{a.id === 'friends' ? a.name : `グループ「${a.name}」`}</option>
				{/each}
			</select>
		</label>

		<p class="ui-note">
			{data.as === 'friends' ? '友だち' : `「${audience}」のメンバー`}には「{label}」で見せています。
			<a href="/friends/sharing">変える</a>
		</p>
	</div>

	{#if data.share === 'none'}
		<p class="empty">時間割は見えません。</p>
	{:else if data.terms.length}
		<TermBar year={data.year} terms={data.terms} bind:termId />
		<TimetableGrid periods={data.periods} {days} courses={termCourses} clock={time.clock} termIsOn={termIsOn(term, time.clock.date)} termStart={term?.startDate} />
		<UnscheduledCards courses={termCourses.filter((c) => c.slots.length === 0)} />
	{:else}
		<p class="empty">まだ{data.year}年度の時間割がありません。</p>
	{/if}
</div>

<style>
	.top {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 16px 12px;
	}

	select {
		height: 48px;
		box-sizing: border-box;
		width: 100%;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.empty {
		margin: 0 16px;
		padding: 14px 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-sub);
	}
</style>
