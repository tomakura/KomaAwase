<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { CALENDAR_LABEL_MAX, spanLabel } from '$lib/calendar';

	let { data, form } = $props();

	const kinds = [
		{ id: 'off', label: '休み' },
		{ id: 'exam', label: '試験期間' }
	] as const;
	let kind = $state<'off' | 'exam'>('off');
	let start = $state('');

	// Over ones at the bottom, faded
	const lists = $derived(
		kinds.map((k) => ({
			...k,
			entries: data.entries
				.filter((e) => e.kind === k.id)
				.toSorted((a, b) => Number(a.end < data.today) - Number(b.end < data.today) || a.start.localeCompare(b.start))
		}))
	);
</script>

<svelte:head>
	<title>日程 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="日程" back={data.back} />

	<p class="lead ui-note">{data.year}年度の休みの日と試験期間です。休みの日は、時間割に授業が出ません。</p>

	<section class="ui-section">
		<h2 class="ui-section-title">まとめて入れる</h2>
		<div class="ui-list">
			<form class="ui-row" method="POST" action="?/holidays" use:enhance>
				<span class="text">
					<span>祝日</span>
					<span class="sub">{data.holidaysMissing ? `${data.holidaysMissing}日分を入れます` : '入れてあります'}</span>
				</span>
				<button class="btn small" type="submit" disabled={!data.holidaysMissing}>入れる</button>
			</form>
			{#if data.preset}
				<form class="ui-row" method="POST" action="?/preset" use:enhance>
					<span class="text">
						<span>{data.preset.name}の日程</span>
						<span class="sub">
							{#if data.preset.source}<a href={data.preset.source} target="_blank" rel="noopener noreferrer">出典</a>・{/if}{data.preset.checkedAt}に確認
						</span>
					</span>
					<button class="btn small" type="submit" disabled={!data.preset.missing}>{data.preset.missing ? '入れる' : '入れてあります'}</button>
				</form>
			{/if}
		</div>
		{#if data.preset}
			<details class="preset">
				<summary>大学の日程の中身</summary>
				<ul>
					{#each data.preset.entries as e, i (i)}<li>{spanLabel(e)} {e.label}</li>{/each}
				</ul>
			</details>
		{/if}
		<p class="ui-note">大学の発表と違うことがあります。正しい日程は大学の案内で確かめてください。</p>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">追加する</h2>
		<form
			class="add"
			method="POST"
			action="?/add"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') start = '';
				}}
		>
			<Segmented options={kinds} bind:value={kind} label="追加するもの" />
			<input type="hidden" name="kind" value={kind} />
			<label class="field">
				名前（任意）
				<input name="label" maxlength={CALENDAR_LABEL_MAX} autocomplete="off" placeholder={kind === 'off' ? '冬休み' : '期末試験'} />
			</label>
			<div class="dates">
				<label class="field">はじまり<input type="date" name="start" required bind:value={start} /></label>
				<label class="field">終わり（任意）<input type="date" name="end" min={start} /></label>
			</div>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit">追加</button>
		</form>
	</section>

	{#each lists as list (list.id)}
		{#if list.entries.length}
			<section class="ui-section">
				<h2 class="ui-section-title">{list.label}</h2>
				<div class="ui-list">
					{#each list.entries as e (e.id)}
						<div class="ui-row" class:past={e.end < data.today}>
							<span class="text">
								<span>{e.label}</span>
								<span class="sub">{spanLabel(e)}</span>
							</span>
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={e.id} />
								<button class="remove" type="submit" aria-label="{spanLabel(e)}の{e.label}を消す">
									<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
								</button>
							</form>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</div>

<style>
	.lead {
		margin: 0;
		padding: 8px 20px 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.sub a {
		color: inherit;
	}

	.past {
		opacity: 0.5;
	}

	.btn.small {
		height: 36px;
		padding: 0 14px;
		font-size: 13px;
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.dates {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
	}

	.dates input {
		min-width: 0;
		width: 100%;
	}

	.preset {
		font-size: 13px;
		color: var(--ink-sub);
	}

	.preset ul {
		margin: 6px 0 0;
		padding-left: 20px;
		line-height: 1.7;
	}

	.remove {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.remove svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
</style>
