<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import type { Snippet } from 'svelte';

	// A page opened from a mail link: the logo and the name at the top (the same on every one),
	// what the page is about under them, and what it does at the bottom
	let { subtitle, children }: { subtitle?: string; children: Snippet } = $props();
</script>

<main>
	<div class="head">
		<Logo size={88} />
		<h1>コマあわせ</h1>
		{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
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
		gap: 28px;
		/* The logo stays where it is however much is below it (same place as on the login screen) */
		padding: clamp(48px, 12vh, 112px) 24px 32px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 34px;
		letter-spacing: 0.03em;
		text-align: center;
	}

	.subtitle {
		margin: -4px 0 0;
		font-size: 15px;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.body {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.body :global(p) {
		margin: 0;
		line-height: 1.7;
		text-align: center;
		overflow-wrap: anywhere;
		/* Break between phrases, not in the middle of a word */
		word-break: auto-phrase;
		text-wrap: pretty;
	}

	.body :global(form) {
		display: flex;
		flex-direction: column;
	}
</style>
