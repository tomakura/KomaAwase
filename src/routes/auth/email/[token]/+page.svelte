<script lang="ts">
	let { form } = $props();
</script>

<svelte:head>
	<title>ログイン · コマあわせ</title>
</svelte:head>

<main>
	<h1>コマあわせにログイン</h1>
	{#if form?.message}
		<p class="error" role="alert">{form.message}</p>
		<a class="btn" href="/login">ログイン画面にもどる</a>
	{:else}
		<p>下のボタンを押すとログインします。</p>
		<form method="POST">
			<button class="btn btn-primary" type="submit">ログインする</button>
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
