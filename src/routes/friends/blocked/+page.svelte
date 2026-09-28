<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>ブロックしている人 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="ブロックしている人" back="/friends" />
	<section class="ui-section">
		{#if data.blocked.length}
			<div class="ui-list">
				{#each data.blocked as p (p.id)}
					<div class="person">
						<UserIcon user={p} size={36} />
						<span class="text">
							<span class="name">{p.nickname}</span>
							{#if p.university}<span class="sub">{p.university}</span>{/if}
						</span>
						<form method="POST" action="?/unblock" use:enhance>
							<input type="hidden" name="id" value={p.id} />
							<button class="small" type="submit">解除</button>
						</form>
					</div>
				{/each}
			</div>
			<p class="ui-note">解除しても友だちには戻りません。もう一度つながるには、申請からやり直します。</p>
		{:else}
			<p class="ui-note">ブロックしている人はいません。</p>
		{/if}
	</section>
</div>

<style>
	.person {
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px 6px 12px;
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
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
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
</style>
