<script lang="ts">
	import BarChart from '$lib/components/BarChart.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { percent } from '$lib/stats';
	import { monthDay } from '$lib/time';

	let { data } = $props();

	const cards = $derived([
		{ label: '利用者', value: data.users, sub: `今週の新規 ${data.newWeek}人` },
		{ label: '24時間に開いた人', value: data.activeDay, sub: `7日 ${data.activeWeek}人 · 30日 ${data.activeMonth}人` },
		{ label: '在籍確認ずみ', value: data.verified, sub: `${percent(data.verified, data.users) ?? 0}%` },
		{ label: '通知をもらえる人', value: data.pushPeople, sub: `授業の前の通知 ${data.reminderPeople}人` }
	]);

	const rows = $derived([
		['時間割', data.timetables],
		['授業', data.courses],
		['みんなと同期している授業', `${data.synced}（${percent(data.synced, data.courses) ?? 0}%）`],
		['みんなの授業データ', data.shared],
		['友だち（成立した組）', data.friends],
		['グループ', data.groups],
		['課題', data.tasks],
		['イベント', data.events],
		['休講', data.cancels],
		['欠席の記録', data.absences]
	] as const);
</script>

<svelte:head>
	<title>数字 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="利用の状況" back="/admin" />

	<div class="cards">
		{#each cards as c (c.label)}
			<div class="card">
				<span class="label">{c.label}</span>
				<b>{c.value}</b>
				<span class="sub">{c.sub}</span>
			</div>
		{/each}
	</div>

	<section class="ui-section">
		<h2 class="ui-section-title">新しく登録した人（直近30日）</h2>
		<BarChart points={data.signups} label="日ごとの新規登録" />
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">24時間に開いた人（毎日の記録）</h2>
		<BarChart points={data.opened} label="日ごとに開いた人" />
		<p class="ui-note">
			{#if data.openedSince}
				{monthDay(data.openedSince)}から記録しています。それより前は残っていません。
			{:else}
				毎朝10時に1日ぶんを記録します。記録が始まるまで、グラフは空です。
			{/if}
		</p>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">使われ方</h2>
		<div class="ui-list">
			{#each rows as [label, value] (label)}
				<div class="ui-row"><span>{label}</span><span class="ui-row-value">{value}</span></div>
			{/each}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">大学ごとの利用者</h2>
		<div class="ui-list">
			{#each data.byUniversity as u (u.name)}
				<div class="ui-row"><span>{u.name}</span><span class="ui-row-value">{u.n}人</span></div>
			{/each}
		</div>
		{#if data.suspended}<p class="ui-note">利用停止中の人が{data.suspended}人います（人数に含まれます）。</p>{/if}
	</section>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		padding: 0 16px 6px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.label {
		font-size: 12px;
		color: var(--ink-soft);
	}

	.card b {
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.2;
	}

	.sub {
		font-size: 11px;
		color: var(--ink-sub);
	}
</style>
