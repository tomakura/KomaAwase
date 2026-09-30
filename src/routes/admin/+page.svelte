<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	const TARGETS = { user: '利用者', group: 'グループ', shared_course: '共有授業' } as const;
	const KINDS = { bug: '不具合', request: '要望', other: 'そのほか' } as const;
	// This page with another page of one list, the other list left where it is
	function pageHref(key: 'reports' | 'feedback', n: number) {
		const url = new URL(page.url);
		if (n > 1) url.searchParams.set(key, String(n));
		else url.searchParams.delete(key);
		return url.pathname + url.search;
	}
	const pages = (total: number) => Math.max(1, Math.ceil(total / data.pageSize));

	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
</script>

<svelte:head>
	<title>運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="運営" back="/more" />

	<section class="ui-section">
		<div class="ui-list">
			<a class="ui-row" href="/admin/courses">
				<span>授業の管理（直す・まとめる）</span>
				<span class="ui-row-value"><Icon name="chevron" size={16} /></span>
			</a>
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">通報（{data.reportTotal}）</h2>
		{#each data.reports as r (r.id)}
			<div class="item">
				<div class="meta">
					<span class="tag">{TARGETS[r.targetType]}</span>
					<b>{r.target}</b>
					<span class="date">{when(r.createdAt)}</span>
				</div>
				<p class="reason">{r.reason}{r.detail ? `：${r.detail}` : ''}</p>
				<div class="foot">
					<span class="from">{r.reporter ?? '（退会した人）'}{#if r.reporterEmail}（{r.reporterEmail}）{/if}から</span>
					{#if r.targetType === 'shared_course'}<a href="/shared/{r.targetId}?back=/admin">変更の履歴</a>{/if}
					<form method="POST" action="?/closeReport" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<button class="small" type="submit">対応済み</button>
					</form>
				</div>
			</div>
		{:else}
			<p class="ui-note">未対応の通報はありません。</p>
		{/each}
		{@render pager('reports', data.reportPage, pages(data.reportTotal))}
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">不具合・要望（{data.feedbackTotal}）</h2>
		{#each data.feedback as f (f.id)}
			<div class="item">
				<div class="meta">
					<span class="tag">{KINDS[f.kind]}</span>
					<span class="date">{when(f.createdAt)}</span>
				</div>
				<p class="body">{f.body}</p>
				{#if f.env}
					<details>
						<summary>端末の情報</summary>
						<dl>
							{#each Object.entries(f.env) as [key, value] (key)}
								<dt>{key}</dt>
								<dd>{value}</dd>
							{/each}
						</dl>
					</details>
				{/if}
				<div class="foot">
					<span class="from">{f.sender ?? '（退会した人）'}{#if f.senderEmail}（{f.senderEmail}）{/if}から</span>
					<form method="POST" action="?/closeFeedback" use:enhance>
						<input type="hidden" name="id" value={f.id} />
						<button class="small" type="submit">対応済み</button>
					</form>
				</div>
			</div>
		{:else}
			<p class="ui-note">未対応の不具合・要望はありません。</p>
		{/each}
		{@render pager('feedback', data.feedbackPage, pages(data.feedbackTotal))}
	</section>
</div>

{#snippet pager(key: 'reports' | 'feedback', current: number, last: number)}
	{#if last > 1}
		<nav class="pager" aria-label="ページ">
			{#if current > 1}<a href={pageHref(key, current - 1)}>新しい{data.pageSize}件</a>{/if}
			<span>{current} / {last}</span>
			{#if current < last}<a href={pageHref(key, current + 1)}>古い{data.pageSize}件</a>{/if}
		</nav>
	{/if}
{/snippet}

<style>
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 12px 0 0;
		font-size: 14px;
	}

	.pager a {
		color: var(--accent-text);
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.meta,
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}

	.tag {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		font-size: 11px;
		font-weight: 700;
	}

	.date,
	.from {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.date {
		margin-left: auto;
	}

	.reason,
	.body {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	details {
		font-size: 12px;
		color: var(--ink-soft);
	}

	dl {
		margin: 6px 0 0;
	}

	dt {
		font-weight: 700;
	}

	dd {
		margin: 0 0 4px;
		overflow-wrap: anywhere;
	}

	.foot form {
		margin-left: auto;
	}

	.small {
		height: 34px;
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
</style>
