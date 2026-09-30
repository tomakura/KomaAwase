<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import type { Snippet } from 'svelte';

	// A page opened from a mail link: the logo and a title at the top, then what it does
	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<main>
	<div class="head">
		<Logo size={88} />
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
