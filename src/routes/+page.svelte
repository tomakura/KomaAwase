<script lang="ts">
	import logo from '$lib/assets/favicon.svg';

	let { data } = $props();
</script>

<main>
	<img src={logo} alt="" width="88" height="88" />
	<h1>コマあわせ</h1>
	<p>{data.nickname} さんでログイン中。時間割の画面はこれから作ります。</p>
	<form method="POST" action="/logout">
		<button class="btn" type="submit">ログアウト</button>
	</form>
</main>

<style>
	main {
		min-height: 100svh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 0 24px;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 34px;
		letter-spacing: 0.03em;
	}

	p {
		margin: 0;
		color: var(--ink-sub);
	}
</style>
