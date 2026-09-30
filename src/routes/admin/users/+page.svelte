<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	const day = (d: Date | null) => (d ? tokyoTime(d.getTime()).date.replace(/-/g, '/') : 'まだ');
	const pages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const href = (page: number) => `?${new URLSearchParams({ ...(data.q ? { q: data.q } : {}), ...(page > 1 ? { page: String(page) } : {}) })}`;
</script>

<svelte:head>
	<title>利用者 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="利用者" back="/admin" />

	<form class="search" method="GET" role="search">
		<input type="search" name="q" value={data.q} placeholder="ニックネームかメールアドレス" maxlength="50" autocomplete="off" />
		<button class="btn" type="submit">さがす</button>
	</form>

	<section class="ui-section">
		<h2 class="ui-section-title">{data.q ? `「${data.q}」の結果` : '登録した順'}（{data.total}人）</h2>
		{#if data.users.length}
			<div class="ui-list">
				{#each data.users as u (u.id)}
					<a class="row" href="/admin/users/{u.id}">
						<span class="text">
							<span class="name">
								{u.nickname ?? '（ニックネームなし）'}
								{#if u.verified}<span class="tag ok">在籍確認</span>{/if}
								{#if u.suspendedAt}<span class="tag stop">利用停止</span>{/if}
								{#if u.reported}<span class="tag warn">通報 {u.reported}</span>{/if}
							</span>
							<span class="sub">{u.email}</span>
							<span class="sub">{u.university ?? '大学なし'} · 登録 {day(u.createdAt)} · 最後 {day(u.lastSeenAt)}</span>
						</span>
						<Icon name="chevron" size={16} />
					</a>
				{/each}
			</div>
		{:else}
			<p class="ui-note">見つかりません。</p>
		{/if}
		{#if pages > 1}
			<nav class="pager" aria-label="ページ">
				{#if data.page > 1}<a href={href(data.page - 1)}>前の{data.pageSize}人</a>{/if}
				<span>{data.page} / {pages}</span>
				{#if data.page < pages}<a href={href(data.page + 1)}>次の{data.pageSize}人</a>{/if}
			</nav>
		{/if}
	</section>
</div>

<style>
	.search {
		display: flex;
		gap: 8px;
		padding: 8px 16px 0;
	}

	.search input {
		min-width: 0;
		flex: 1;
		height: 48px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.search .btn {
		min-height: 48px;
		padding: 0 16px;
	}

	.row {
		min-height: 64px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		color: var(--ink);
		text-decoration: none;
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		font-weight: 700;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
		overflow-wrap: anywhere;
	}

	.tag {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		font-size: 11px;
	}

	.tag.stop {
		background: var(--course-red);
		color: var(--ink);
	}

	.tag.warn {
		background: var(--course-orange);
		color: var(--now-text);
	}

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
</style>
