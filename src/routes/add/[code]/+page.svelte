<script lang="ts">
	import { enhance } from '$app/forms';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import VerifiedBadge from '$lib/components/VerifiedBadge.svelte';

	let { data, form } = $props();
	const name = $derived(data.person.nickname ?? '');
</script>

<svelte:head>
	<title>{name}さんと友だちになる · コマあわせ</title>
</svelte:head>

<main>
	<div class="person">
		<UserIcon user={data.person} size={88} />
		<h1>{name}</h1>
		{#if data.person.university}<p class="university">{data.person.university}</p>{/if}
		{#if data.person.verified}<VerifiedBadge label />{/if}
	</div>

	<div class="actions">
		{#if data.state === 'self'}
			<p class="text">これはあなたの友だちリンクです。友だちに送ると、相手から申請が届きます。</p>
			<a class="btn" href="/friends/add">友だちリンクの画面へ</a>
		{:else if data.state === 'friends'}
			<p class="text">{name}さんとはもう友だちです。</p>
			<a class="btn btn-primary" href="/friends/{data.person.id}">時間割を見る</a>
		{:else if data.state === 'pending'}
			<p class="text">申請しました。{name}さんが承認すると、おたがいの時間割が見られるようになります。</p>
			<a class="btn" href="/friends">友だちの画面へ</a>
		{:else if data.state === 'unavailable'}
			<p class="text">{name}さんには申請できません。</p>
			<a class="btn" href="/friends">友だちの画面へ</a>
		{:else}
			<p class="text">
				{data.state === 'asked'
					? `${name}さんから申請が届いています。承認すると、おたがいの時間割が見られるようになります。`
					: `申請して${name}さんが承認すると、おたがいの時間割が見られるようになります。`}
			</p>
			<form method="POST" use:enhance>
				<button class="btn btn-primary" type="submit">{data.state === 'asked' ? '承認する' : '友だち申請する'}</button>
			</form>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<a class="later" href="/">やめる</a>
		{/if}
	</div>
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

	.person {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}

	h1 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 26px;
		overflow-wrap: anywhere;
		text-align: center;
	}

	.university {
		margin: 0;
		color: var(--ink-sub);
	}

	.actions,
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.text {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.later {
		align-self: center;
		padding: 12px;
		font-size: 14px;
	}
</style>
