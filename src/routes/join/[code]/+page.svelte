<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { INVITE_CLOSED, SHARE_CHOICES, SHARE_NOTES, type ShareChoice } from '$lib/sharing';

	let { data, form } = $props();
	let share = $state<ShareChoice>('all');
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

	{#if data.banned}
		<div class="actions">
			<p class="notice" role="status">この招待からは参加できません。招待した人にご確認ください。</p>
			<a class="btn" href="/">もどる</a>
		</div>
	{:else if data.closed && !data.requested}
		<div class="actions">
			<p class="notice" role="status">{INVITE_CLOSED[data.closed]}</p>
			<a class="btn" href="/">もどる</a>
		</div>
	{:else if (data.requested || form?.requested) && !form?.cancelled}
		<form class="actions" method="POST" action="?/cancel" use:enhance>
			<p class="notice" role="status">申請しました。グループの管理者が承認すると参加できます。</p>
			<a class="btn btn-primary" href="/">時間割にもどる</a>
			<button class="later" type="submit">申請を取り消す</button>
		</form>
	{:else}
		<form class="actions" method="POST" action="?/join" use:enhance>
			<!-- The choice people make on joining, where they can't miss it -->
			<div class="choice">
				<span class="row">このグループへの時間割の見せ方</span>
				<Segmented options={SHARE_CHOICES} bind:value={share} label="このグループへの時間割の見せ方" name="share" />
				<p>
					{SHARE_NOTES[share]}
					参加したあとも変えられます。
				</p>
			</div>
			{#if data.approval}<p class="ui-note">このグループは承認制です。グループの管理者が承認すると参加できます。</p>{/if}
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit">{data.approval ? '参加を申請する' : '参加する'}</button>
			<a class="later" href="/">やめる</a>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
		min-height: var(--page-h);
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

	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.notice {
		margin: 0;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
		line-height: 1.7;
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
		border: none;
		background: none;
		color: var(--accent-text);
		font: inherit;
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
