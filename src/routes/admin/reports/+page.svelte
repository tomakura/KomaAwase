<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	const TARGETS = { user: '利用者', group: 'グループ', shared_course: '共有授業', shared_cancel: '休講の共有' } as const;
	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
	const pages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const pageHref = (n: number) => (n > 1 ? `?page=${n}` : '?');
</script>

<svelte:head>
	<title>通報 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="通報" back="/admin" />

	<section class="ui-section">
		<h2 class="ui-section-title">未対応（{data.total}）</h2>
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
					{#if r.targetType === 'shared_course'}<a href="/shared/{r.targetId}?back=/admin/reports">変更の履歴</a>{/if}
					{#if r.targetType === 'shared_cancel'}
						<form method="POST" action="?/hideCancel" use:enhance>
							<input type="hidden" name="targetId" value={r.targetId} />
							<button class="small" type="submit">その日の共有を消す</button>
						</form>
					{/if}
					<form method="POST" action="?/closeReport" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<button class="small" type="submit">対応済み</button>
					</form>
				</div>
			</div>
		{:else}
			<p class="ui-note">未対応の通報はありません。</p>
		{/each}
		{#if pages > 1}
			<nav class="pager" aria-label="ページ">
				{#if data.page > 1}<a href={pageHref(data.page - 1)}>新しい{data.pageSize}件</a>{/if}
				<span>{data.page} / {pages}</span>
				{#if data.page < pages}<a href={pageHref(data.page + 1)}>古い{data.pageSize}件</a>{/if}
			</nav>
		{/if}
	</section>

</div>

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

	.reason {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.foot form {
		margin-left: auto;
	}

	.foot form + form {
		margin-left: 0;
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
