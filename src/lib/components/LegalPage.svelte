<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from './PageHeader.svelte';

	// Terms, privacy and about: readable signed in or not.
	let { title, updated, children }: { title: string; updated?: string; children: Snippet } = $props();
	const back = $derived(page.data.signedIn ? '/more' : '/login');
</script>

<svelte:head>
	<title>{title} · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader {title} {back} />
	<article>
		{#if updated}<p class="updated">{updated}</p>{/if}
		{@render children()}
	</article>
</div>

<style>
	article {
		padding: 4px 20px 0;
		font-size: 14px;
		line-height: 1.85;
	}

	.updated {
		margin: 0 0 12px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	article :global(h2) {
		margin: 24px 0 6px;
		font-size: 15px;
		font-weight: 700;
	}

	article :global(p) {
		margin: 0 0 10px;
	}

	article :global(ul),
	article :global(ol) {
		margin: 0 0 10px;
		padding-left: 1.4em;
	}

	article :global(li) {
		margin-bottom: 4px;
	}

	article :global(dl) {
		margin: 0 0 10px;
	}

	article :global(dt) {
		font-weight: 700;
	}

	article :global(dd) {
		margin: 0 0 8px;
	}
</style>
