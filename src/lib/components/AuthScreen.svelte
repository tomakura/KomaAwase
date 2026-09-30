<script lang="ts">
	import logo from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	// A page opened from a mail link: the logo and a title in the middle, then what it does
	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<main>
	<div class="head">
		<img src={logo} alt="" width="72" height="72" />
		<h1>{title}</h1>
	</div>
	<div class="body">
		{@render children()}
	</div>
</main>

<style>
	main {
		min-height: var(--page-h);
		box-sizing: border-box;
		max-width: 420px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
		padding: 32px 24px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 28px;
		letter-spacing: 0.03em;
		text-align: center;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.body :global(p) {
		margin: 0;
		line-height: 1.7;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.body :global(form) {
		display: flex;
		flex-direction: column;
	}
</style>
