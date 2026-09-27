<script lang="ts">
	import logo from '$lib/assets/favicon.svg';
</script>

<main>
	<img src={logo} alt="" width="88" height="88" />
	<h1>コマあわせ</h1>
	<p>友だちと、時間割を共有しよう。</p>
</main>

<style>
	main {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 0 24px;
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
