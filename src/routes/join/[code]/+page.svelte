<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Switch from '$lib/components/Switch.svelte';

	let { data, form } = $props();
	let share = $state(true);
</script>

<svelte:head>
	<title>「{data.name}」に参加 · コマあわせ</title>
</svelte:head>

<main>
	<div class="group">
		<span class="group-icon"><Icon name="users" size={40} /></span>
		<h1>{data.name}</h1>
		<p class="count">{data.members}人が参加しています</p>
	</div>

	<form method="POST" use:enhance>
		<!-- The choice people make on joining, where they can't miss it -->
		<div class="choice">
			<div class="row">
				<span id="share-label">このグループに時間割を見せる</span>
				<Switch bind:checked={share} labelledby="share-label" name="share" />
			</div>
			<p>
				{share
					? 'メンバーはあなたの時間割を見たり、重ねたりできます。メモ・資料・課題は見えません。'
					: 'メンバーにはあなたの時間割が見えません。'}
				参加したあとも変えられます。
			</p>
		</div>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit">参加する</button>
		<a class="later" href="/">やめる</a>
	</form>
</main>

<style>
	main {
		max-width: 420px;
		min-height: 100svh;
		box-sizing: border-box;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: 0 24px 32px;
	}

	.group {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}

	.group-icon {
		width: 88px;
		height: 88px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 24px;
		background: var(--slot);
		color: var(--ink-soft);
	}

	h1 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 26px;
		overflow-wrap: anywhere;
		text-align: center;
	}

	.count {
		margin: 0;
		color: var(--ink-sub);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.choice {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: var(--surface);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
		font-weight: 700;
	}

	.choice p {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.later {
		align-self: center;
		padding: 12px;
		font-size: 14px;
	}
</style>
