<script lang="ts">
	import { slide } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { motion } from '$lib/motion';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	// 9月30日
	const day = (ms: number) => {
		const [, m, d] = tokyoTime(ms).date.split('-').map(Number);
		return `${m}月${d}日`;
	};
	const others = $derived(data.sessions.filter((s) => !s.current));
	const computer = (name: string | null) => /^(Windows|Mac|Linux|Chromebook)/.test(name ?? '');
</script>

<svelte:head>
	<title>ログイン中の端末 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="ログイン中の端末" back="/more" />
	<div class="body">
		<p class="ui-note">ログインしている端末を確かめて、ログアウトさせられます。</p>
		<div class="ui-list">
			{#each data.sessions as s (s.id)}
				<div transition:slide={motion()} class="device">
					<span class="icon"><Icon name={computer(s.name) ? 'monitor' : 'phone'} size={20} /></span>
					<span class="text">
						<span class="name">{s.name ?? '不明な端末'}{#if s.current}<span class="tag">この端末</span>{/if}</span>
						{#if s.lastUsedAt}<span class="sub">最後に使った日：{day(s.lastUsedAt)}</span>{/if}
					</span>
					{#if !s.current}
						<form
							method="POST"
							action="?/end"
							use:enhance={({ cancel }) => {
								if (!confirm(`「${s.name ?? '不明な端末'}」をログアウトさせますか？`)) cancel();
							}}
						>
							<input type="hidden" name="id" value={s.id} />
							<button class="out" type="submit" aria-label="この端末をログアウトさせる"><Icon name="logout" size={20} /></button>
						</form>
					{/if}
				</div>
			{/each}
		</div>

		{#if others.length}
			<form
				method="POST"
				action="?/endOthers"
				use:enhance={({ cancel }) => {
					if (!confirm('この端末のほかは、すべてログアウトします。よろしいですか？')) cancel();
				}}
			>
				<button class="btn" type="submit">ほかの端末をすべてログアウト</button>
			</form>
		{:else if form?.ended}
			<p class="ui-note" role="status">ほかの端末をログアウトしました。</p>
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.device {
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px 6px 12px;
	}

	.icon {
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

	.tag {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 700;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	form {
		display: flex;
		flex-direction: column;
	}

	.out {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
</style>
