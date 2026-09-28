<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ReportForm from '$lib/components/ReportForm.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { DAY_NAMES, deliveryLabel, weekLabel, type Delivery, type WeekPattern } from '$lib/courses';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	type Values = {
		title: string;
		teachers: string[];
		slots: { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null }[];
		delivery: Delivery | null;
		intensiveFrom: string | null;
		intensiveTo: string | null;
	};

	const slotText = (s: Values['slots'][number]) =>
		`${DAY_NAMES[s.weekday]}${s.period}限${s.span > 1 ? `〜${s.period + s.span - 1}限` : ''}${weekLabel(s.week) ? `（${weekLabel(s.week)}）` : ''}${s.room ? ` ${s.room}` : ''}`;
	const fields = (v: Values) => ({
		授業名: v.title,
		先生: v.teachers.join('・') || 'なし',
		'曜日・時限': v.slots.map(slotText).join('、') || deliveryLabel(v.delivery, v.intensiveFrom, v.intensiveTo) || 'なし'
	});

	// What an edit changed, field by field
	function changes(diff: { before: unknown; after: unknown }) {
		const after = fields(diff.after as Values);
		if (!diff.before) return [{ label: '最初の登録', text: `${after['授業名']} · ${after['曜日・時限']}` }];
		const before = fields(diff.before as Values);
		return (Object.keys(after) as (keyof typeof after)[]).flatMap((key) =>
			before[key] === after[key] ? [] : [{ label: key, text: `${before[key]} → ${after[key]}` }]
		);
	}

	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};

	const current = $derived(fields(data.course.values));
	// The same page with another page of the history (keeps ?back=)
	function historyPage(n: number) {
		const url = new URL(page.url);
		if (n > 1) url.searchParams.set('page', String(n));
		else url.searchParams.delete('page');
		return url.pathname + url.search;
	}
	let reporting = $state(false);
</script>

<svelte:head>
	<title>{data.course.values.title}（みんなの授業データ） · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="みんなの授業データ" back={data.back} />

	<section class="ui-section">
		<div class="card">
			<h2>{data.course.values.title}</h2>
			<dl>
				<dt>先生</dt>
				<dd>{current['先生']}</dd>
				<dt>曜日・時限</dt>
				<dd>{current['曜日・時限']}</dd>
				{#if data.course.terms.length}
					<dt>学期</dt>
					<dd>{data.course.year}年度 {data.course.terms.join('・')}</dd>
				{/if}
			</dl>
			<p class="meta">
				{data.course.university} · {data.course.source === 'syllabus' ? 'シラバスから' : 'みんなの登録'} · {data.users}人が同期中
			</p>
		</div>
		<p class="ui-note">
			同じ大学の人ならだれでも直せます。直すと、同期しているみんなの時間割に反映されます。まちがった変更は、下の履歴から元に戻せます。
		</p>
		<button class="btn" type="button" onclick={() => (reporting = true)}><Icon name="flag" size={18} />まちがい・荒らしを報告する</button>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">変更の履歴</h2>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		{#if form?.restored}<p class="done" role="status">元に戻しました。</p>{/if}
		<div class="ui-list">
			{#each data.edits as edit, i (edit.id)}
				<div class="edit">
					<div class="edit-head">
						<span class="date">{when(edit.createdAt)}</span>
						{#if data.page === 1 && i === 0}<span class="now">いまの内容</span>{/if}
					</div>
					{#each changes(edit.diff) as change (change.label)}
						<p class="change"><b>{change.label}</b>{change.text}</p>
					{/each}
					{#if data.page > 1 || i > 0}
						<form
							method="POST"
							action="?/restore"
							use:enhance={({ cancel }) => {
								if (!confirm('この変更のあとの内容に戻します。同期しているみんなの時間割も変わります')) cancel();
							}}
						>
							<input type="hidden" name="edit" value={edit.id} />
							<input type="hidden" name="version" value={data.course.version} />
							<button class="small" type="submit"><Icon name="history" size={16} />この内容に戻す</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
		{#if data.page > 1 || data.more}
			<nav class="pages" aria-label="履歴のページ">
				{#if data.page > 1}<a href={historyPage(data.page - 1)}>新しい変更へ</a>{/if}
				{#if data.more}<a class="older" href={historyPage(data.page + 1)}>もっと前の変更</a>{/if}
			</nav>
		{/if}
		<p class="ui-note">だれが直したかは表示しません。</p>
	</section>
</div>

<Sheet bind:open={reporting} title="授業のデータを報告">
	<ReportForm reasons={data.reportReasons} action="?/report" done={() => (reporting = false)} />
</Sheet>

<style>
	.pages {
		display: flex;
		gap: 12px;
		padding: 10px 2px 0;
		font-size: 14px;
	}

	.pages a {
		color: var(--accent-text);
	}

	.older {
		margin-left: auto;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 20px;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}

	dt {
		color: var(--ink-sub);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.edit {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 14px;
	}

	.edit-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.date {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.now {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--course-green);
		font-size: 11px;
		font-weight: 700;
	}

	.change {
		display: flex;
		flex-direction: column;
		margin: 0;
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.change b {
		font-size: 11px;
		color: var(--ink-soft);
	}

	.edit form {
		align-self: flex-start;
		margin-top: 4px;
	}

	.small {
		height: 34px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.done {
		margin: 0;
		font-size: 13px;
		color: var(--ink-soft);
	}
</style>
