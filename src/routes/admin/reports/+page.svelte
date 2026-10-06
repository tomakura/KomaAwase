<script lang="ts">
	import { enhance } from '$app/forms';
	import { ask } from '$lib/confirm.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();
	// The group whose name is being changed
	let renaming = $state<string | null>(null);

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
					{#if r.target === null}
						<b>（消えています）</b>
					{:else if r.targetType === 'user'}
						<a class="target" href="/admin/users/{r.targetId}">{r.target}</a>
					{:else if r.targetType === 'shared_course'}
						<a class="target" href="/shared/{r.targetId}?back=/admin/reports">{r.target}</a>
					{:else}
						<b>{r.target}</b>
					{/if}
					<span class="date">{when(r.createdAt)}</span>
				</div>
				<p class="reason">{r.reason}{r.detail ? `：${r.detail}` : ''}</p>
				{#if r.targetType === 'group' && r.target !== null}
					<p class="sub">
						オーナー：{#if r.owner}<a href="/admin/users/{r.owner.id}">{r.owner.nickname ?? '（名前なし）'}</a>{:else}なし{/if}
					</p>
					{#if renaming === r.targetId}
						<form
							class="rename"
							method="POST"
							action="?/renameGroup"
							use:enhance={() =>
								async ({ result, update }) => {
									if (result.type === 'success') renaming = null;
									await update({ reset: false });
								}}
						>
							<input type="hidden" name="id" value={r.targetId} />
							<input name="name" value={r.target} maxlength={data.groupNameMax} required aria-label="新しいグループ名" />
							<button class="small" type="submit">変える</button>
						</form>
						{#if form?.message && form.id === r.targetId}<p class="error" role="alert">{form.message}</p>{/if}
					{/if}
				{/if}
				{#if r.markers.length}
					<p class="sub">
						休講にした人：{#each r.markers as m, i (m.id)}{i ? '、' : ''}<a href="/admin/users/{m.id}">{m.nickname ?? '（名前なし）'}</a>{/each}
					</p>
				{/if}
				<div class="foot">
					<span class="from">{r.reporter ?? '（退会した人）'}{#if r.reporterEmail}（{r.reporterEmail}）{/if}から</span>
					<div class="actions">
						{#if r.targetType === 'group' && r.target !== null}
							<button class="small" type="button" onclick={() => (renaming = renaming === r.targetId ? null : r.targetId)}>名前を変える</button>
							<form
								method="POST"
								action="?/deleteGroup"
								use:enhance={async ({ cancel }) => {
									if (!(await ask({ message: `グループ「${r.target}」を削除します。メンバー全員から消えて、元に戻せません`, ok: '削除する', danger: true }))) return cancel();
								}}
							>
								<input type="hidden" name="id" value={r.targetId} />
								<button class="small" type="submit">グループを削除</button>
							</form>
						{/if}
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

	.target,
	.sub a {
		color: var(--accent-text);
		font-weight: 700;
	}

	.sub {
		margin: 0;
		font-size: 13px;
	}

	.sub a {
		font-weight: 400;
	}

	.rename {
		display: flex;
		gap: 8px;
	}

	.rename input[name='name'] {
		flex: 1 1 0;
		min-width: 0;
		height: 34px;
		box-sizing: border-box;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.reason {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
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
