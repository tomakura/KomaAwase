<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import ReportForm from '$lib/components/ReportForm.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import TimetableGrid from '$lib/components/TimetableGrid.svelte';
	import UnscheduledCards from '$lib/components/UnscheduledCards.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import VerifiedBadge from '$lib/components/VerifiedBadge.svelte';
	import { liveClock } from '$lib/clock.svelte';
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

	let menu = $state(false);
	let reporting = $state(false);
	const name = $derived(data.person.nickname ?? '');
</script>

<svelte:head>
	<title>{name}さんの時間割 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<header>
		<a class="back" href="/friends" aria-label="もどる"><Icon name="back" size={22} /></a>
		<UserIcon user={data.person} size={36} />
		<span class="who">
			<h1>{name}</h1>
			{#if data.person.university}
				<span class="sub">{data.person.university}{#if data.person.verified}&nbsp;<VerifiedBadge label />{/if}</span>
			{/if}
		</span>
		<button class="menu" type="button" aria-label="{name}さんのメニュー" onclick={() => (menu = true)}>
			<Icon name="more" size={22} />
		</button>
	</header>

	{#if data.terms.length}
		<div class="actions">
			<a class="btn" href="/overlay?with={data.person.id}"><Icon name="overlap" size={18} />自分の時間割と重ねる</a>
		</div>
		{#if data.busyOnly}<p class="ui-note busy">{name}さんは、空き時間だけを見せています。</p>{/if}
		<TermBar year={data.year} terms={data.terms} bind:termId />
		<TimetableGrid periods={data.periods} {days} courses={termCourses} clock={time.clock} termIsOn={termIsOn(term, time.clock.date)} termStart={term?.startDate} />
		<UnscheduledCards courses={termCourses.filter((c) => c.slots.length === 0)} />
	{:else}
		<p class="empty">{name}さんは、まだ{data.year}年度の時間割を作っていません。</p>
	{/if}
</div>

<Sheet bind:open={menu} title="{name}さん">
	<div class="ui-list">
		{#if data.isFriend}
			<form
				method="POST"
				action="?/unfriend"
				use:enhance={async ({ cancel }) => {
					if (!(await ask({ message: `${name}さんと友だちをやめます。おたがいの時間割は見えなくなります`, ok: 'やめる', danger: true }))) return cancel();
				}}
			>
				<button class="ui-row" type="submit"><span>友だちをやめる</span></button>
			</form>
		{/if}
		<form
			method="POST"
			action="?/block"
			use:enhance={async ({ cancel }) => {
				if (!(await ask({ message: `${name}さんをブロックします。友だちではなくなり、同じグループにいても時間割は見えなくなります`, ok: 'ブロック', danger: true }))) return cancel();
			}}
		>
			<button class="ui-row" type="submit"><span>ブロックする</span><Icon name="block" size={18} /></button>
		</form>
		<button
			class="ui-row"
			type="button"
			onclick={() => {
				menu = false;
				reporting = true;
			}}><span>通報する</span><Icon name="flag" size={18} /></button
		>
	</div>
</Sheet>

<Sheet bind:open={reporting} title="{name}さんを通報">
	<ReportForm reasons={data.reportReasons} action="?/report" done={() => (reporting = false)} />
</Sheet>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 8px 10px;
	}

	.back,
	.menu {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.who {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 19px;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.actions {
		padding: 0 16px 10px;
	}

	.busy {
		padding: 0 20px 6px;
	}

	.actions .btn {
		min-height: 44px;
		font-size: 14px;
	}

	.empty {
		margin: 12px 16px;
		padding: 16px;
		border: 1px dashed var(--line-strong);
		border-radius: 14px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}
</style>
