<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { form } = $props();
</script>

<svelte:head>
	<title>在籍確認 · コマあわせ</title>
</svelte:head>

<main>
	<h1>在籍確認</h1>
	{#if form?.university !== undefined}
		<p role="status">{form.university}の在籍を確認できました。友だちや同じグループの人に「在籍確認済み」の印が見えます。</p>
		<a class="btn" href={page.data.signedIn ? '/more/verify' : '/login'}>コマあわせを開く</a>
	{:else if form?.message}
		<p class="error" role="alert">{form.message}</p>
		<a class="btn" href="/more/verify">もう一度申し込む</a>
	{:else}
		<p>下のボタンを押すと、確認が終わります。</p>
		<form method="POST" use:enhance>
			<button class="btn btn-primary" type="submit">確認する</button>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: 64px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
	}

	p {
		margin: 0;
		line-height: 1.7;
	}
</style>
