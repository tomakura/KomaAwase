<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>その他 · コマあわせ</title>
</svelte:head>

<!-- Only sign-out for now; the rest of the settings come later. -->
<div class="screen">
	<main>
		<h1>その他</h1>
		<p>{data.nickname} さんでログイン中</p>
		<form method="POST" action="/logout">
			<button class="btn" type="submit">ログアウト</button>
		</form>
	</main>

	<BottomNav current="more" />
</div>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 22px 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
	}

	p {
		margin: 0;
		color: var(--ink-sub);
	}
</style>
