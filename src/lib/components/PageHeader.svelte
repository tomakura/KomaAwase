<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let { title, back, trailing }: { title: string; back: string; trailing?: Snippet } = $props();
</script>

<header>
	<a class="back" href={back} aria-label="もどる"><Icon name="back" size={22} /></a>
	<h1>{title}</h1>
	{#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 10px 8px 6px;
	}

	.back {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink);
	}

	h1 {
		min-width: 0;
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 20px;
		overflow-wrap: anywhere;
	}

	.trailing {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 4px;
	}
</style>
