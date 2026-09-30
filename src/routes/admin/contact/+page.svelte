<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
	const pages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const pageHref = (n: number) => (n > 1 ? `?page=${n}` : '?');
</script>

<svelte:head>
	<title>問い合わせ · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="問い合わせ" back="/admin" />

	<section class="ui-section">
		<h2 class="ui-section-title">未対応（{data.total}）</h2>
		{#each data.contact as c (c.id)}
			<div class="item">
				<div class="meta">
					<b>{c.name}</b>
					<span class="date">{when(c.createdAt)}</span>
				</div>
				<p class="body">{c.body}</p>
				<div class="foot">
					<a href="mailto:{c.email}?subject={encodeURIComponent('コマあわせへのお問い合わせ')}">{c.email}</a>
					<form method="POST" action="?/closeContact" use:enhance>
						<input type="hidden" name="id" value={c.id} />
						<button class="small" type="submit">対応済み</button>
					</form>
				</div>
			</div>
		{:else}
			<p class="ui-note">未対応の問い合わせはありません。</p>
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

	.pager a,
	.foot a {
		color: var(--accent-text);
	}

	.foot a {
		font-size: 12px;
		overflow-wrap: anywhere;
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

	.date {
		margin-left: auto;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.body {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
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
