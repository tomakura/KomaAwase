<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let { title, back, trailing }: { title: string; back: string; trailing?: Snippet } = $props();
</script>

<header>
	<a class="back" href={back} data-back>
		<Icon name="back" size={22} />
		<span class="visually-hidden">もどる：</span>
		<h1>{title}</h1>
	</a>
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
		min-width: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px 0 11px;
		color: var(--ink);
		text-decoration: none;
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
