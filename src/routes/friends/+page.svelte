<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/motion';
	import { enhance } from '$app/forms';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import VerifiedBadge from '$lib/components/VerifiedBadge.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>友だち · コマあわせ</title>
</svelte:head>

{#snippet who(p: (typeof data.outgoing)[number] & { verified?: boolean })}
	<UserIcon user={p} size={36} />
	<span class="text">
		<span class="name">{p.nickname}{#if p.verified}&nbsp;<VerifiedBadge />{/if}</span>
		{#if p.university}<span class="sub">{p.university}</span>{/if}
	</span>
{/snippet}

<div class="screen">
	<header>
		<h1>友だち</h1>
		<a class="add" href="/friends/add"><Icon name="plus" size={18} />追加</a>
	</header>

	<main>
		<a class="overlay" href="/overlay">
			<Icon name="overlap" size={20} />
			<span class="text">
				<span class="name">コマを重ねる</span>
				<span class="sub">友だちと時間割を重ねて、みんな空いてるコマを探す</span>
			</span>
			<Icon name="chevron" size={16} />
		</a>

		{#if data.incoming.length}
			<section class="ui-section">
				<h2 class="ui-section-title">申請が届いています（{data.incoming.length}）</h2>
				<div class="ui-list">
					{#each data.incoming as p (p.id)}
						<div transition:slide={motion()} class="person">
							{@render who(p)}
							<form method="POST" action="?/accept" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<button class="small primary" type="submit">承認</button>
							</form>
							<form
								method="POST"
								action="?/remove"
								use:enhance={async ({ cancel }) => {
									if (!(await ask({ message: `${p.nickname}さんからの申請を断ります`, ok: '断る', danger: true }))) return cancel();
								}}
							>
								<input type="hidden" name="id" value={p.id} />
								<button class="icon-only" type="submit" aria-label="{p.nickname}さんからの申請を断る">
									<Icon name="close" size={18} />
								</button>
							</form>
						</div>
					{/each}
				</div>
				<p class="ui-note">承認すると、おたがいの時間割が見られるようになります。</p>
			</section>
		{/if}

		<section class="ui-section">
			<h2 class="ui-section-title">友だち{data.friends.length ? `（${data.friends.length}）` : ''}</h2>
			{#if data.friends.length}
				<div class="ui-list">
					{#each data.friends as p (p.id)}
						<a transition:slide={motion()} class="person" href="/friends/{p.id}">
							{@render who(p)}
							<Icon name="chevron" size={16} />
						</a>
					{/each}
				</div>
			{:else}
				<div class="empty">
					<p>まだ友だちがいません。右上の「追加」から、友だちリンクを送れます。</p>
				</div>
			{/if}
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">グループ</h2>
			{#if data.groups.length}
				<div class="ui-list">
					{#each data.groups as g (g.id)}
						<a transition:slide={motion()} class="person" href="/groups/{g.id}">
							<span class="group-icon"><Icon name="users" size={20} /></span>
							<span class="text">
								<span class="name">{g.name}</span>
								<span class="sub">
									{g.members}人{g.share ? '' : ' · 時間割を見せていません'}{#if g.requests}<span class="requests"> · 参加の申請 {g.requests}件</span>{/if}
								</span>
							</span>
							<Icon name="chevron" size={16} />
						</a>
					{/each}
				</div>
			{/if}
			<a class="new-group" href="/groups/new"><Icon name="plus" size={18} />グループを作る</a>
			<p class="ui-note">サークルやゼミのメンバーと、まとめて時間割を重ねられます。参加は招待リンクから。</p>
		</section>

		{#if data.outgoing.length}
			<section class="ui-section">
				<h2 class="ui-section-title">申請中</h2>
				<div class="ui-list">
					{#each data.outgoing as p (p.id)}
						<div transition:slide={motion()} class="person">
							{@render who(p)}
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<button class="small" type="submit">取り消す</button>
							</form>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<div class="links">
			<a href="/friends/sharing">時間割の見せ方</a>
			<a href="/friends/blocked">ブロックしている人</a>
		</div>
	</main>

	<BottomNav current="friends" />
</div>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 0 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 22px;
	}

	.add {
		height: 40px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 14px 0 10px;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
	}

	main {
		display: flex;
		flex-direction: column;
		padding-bottom: 28px;
	}

	.overlay {
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 14px 16px 0;
		padding: 8px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}

	.person {
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px 6px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	a.person {
		padding-right: 14px;
	}

	.person > :global(.icon) {
		color: var(--ink-sub);
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		font-size: 15px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.requests {
		color: var(--accent-text);
		font-weight: 700;
	}

	.group-icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		background: var(--slot);
		color: var(--ink-soft);
	}

	.small {
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--line-bold);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.small.primary {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.icon-only {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border: 1px dashed var(--line-strong);
		border-radius: 14px;
	}

	.empty p {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.new-group {
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px dashed var(--line-bold);
		border-radius: 14px;
		color: var(--ink);
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
	}

	.links {
		align-self: center;
		display: flex;
		gap: 8px;
		margin-top: 22px;
	}

	.links a {
		padding: 10px;
		color: var(--ink-sub);
		font-size: 13px;
	}
</style>
