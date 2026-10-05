<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	const KINDS = { bug: '不具合', request: '要望', other: 'そのほか' } as const;
	const STATUS = { open: '受付', doing: '対応中', closed: '対応済み', declined: '見送り' } as const;
	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
	const pages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const pageHref = (n: number) => (n > 1 ? `?page=${n}` : '?');
</script>

<svelte:head>
	<title>不具合・要望 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="不具合・要望" back="/admin" />

	<section class="ui-section">
		<h2 class="ui-section-title">未対応（{data.total}）</h2>
		{#each data.feedback as f (f.id)}
			<div class="item">
				<div class="meta">
					<span class="tag">{KINDS[f.kind]}</span>
					{#if f.status === 'doing'}<span class="tag">対応中</span>{/if}
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
				</div>
				<form class="answer" method="POST" action="?/update" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="id" value={f.id} />
					<label class="field">
						送った人に見える返事（任意）
						<textarea name="reply" rows="2" maxlength="1000">{f.reply ?? ''}</textarea>
					</label>
					<div class="answer-row">
						<select name="status" aria-label="状態">
							{#each Object.entries(STATUS) as [value, label] (value)}
								<option {value} selected={f.status === value}>{label}</option>
							{/each}
						</select>
						<button class="small" type="submit">保存</button>
					</div>
					{#if form?.message && form.id === f.id}<p class="error" role="alert">{form.message}</p>{/if}
				</form>
			</div>
		{:else}
			<p class="ui-note">未対応の不具合・要望はありません。</p>
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

	.answer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}

	.answer textarea {
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
		resize: vertical;
	}

	.answer-row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.answer select {
		height: 34px;
		padding: 0 8px;
		border: 1px solid var(--line-bold);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
	}

	.error {
		margin: 0;
		font-size: 12px;
		color: var(--accent-text);
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
