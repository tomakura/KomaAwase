<script lang="ts">
	// The year and 前期・後期 on the left, the term tabs on the right
	let {
		year,
		terms,
		termId = $bindable(),
		onchange
	}: {
		year: number;
		terms: { id: string; name: string; groupName: string | null }[];
		termId: string | undefined;
		onchange?: (id: string) => void;
	} = $props();

	const term = $derived(terms.find((t) => t.id === termId));

	// The mark behind the chosen tab slides from one tab to the next. It is placed once the tabs
	// are on screen (until then the chosen tab has its own background), and again when their
	// size changes (the fonts arriving, say).
	let tabs = $state<HTMLElement>();
	let mark = $state<{ x: number; w: number } | null>(null);
	let moves = $state(false);
	function place() {
		const chosen = tabs?.querySelector<HTMLElement>('button[aria-pressed="true"]');
		mark = chosen ? { x: chosen.offsetLeft, w: chosen.offsetWidth } : null;
	}
	$effect(() => {
		void termId;
		void terms;
		place();
	});
	$effect(() => {
		if (!tabs) return;
		const watch = new ResizeObserver(place);
		watch.observe(tabs);
		for (const b of tabs.querySelectorAll('button')) watch.observe(b);
		// Slides only after the first placement, or the mark would come in from the left
		const enable = setTimeout(() => (moves = true), 50);
		return () => {
			clearTimeout(enable);
			watch.disconnect();
		};
	});
</script>

<div class="term-bar">
	<div class="term-title">
		<span class="year">{year}年度</span>
		<span class="group">{term?.groupName ?? term?.name ?? ''}</span>
	</div>
	<div class="tabs" role="group" aria-label="学期" bind:this={tabs}>
		{#if mark}<span class="mark" class:moves style:transform="translateX({mark.x}px)" style:width="{mark.w}px" aria-hidden="true"></span>{/if}
		{#each terms as t (t.id)}
			<button
				type="button"
				class:placed={!!mark}
				aria-pressed={t.id === termId}
				onclick={() => {
					termId = t.id;
					onchange?.(t.id);
				}}
			>
				{t.name}
			</button>
		{/each}
	</div>
</div>

<style>
	.term-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 16px 12px;
	}

	.term-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.year {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.group {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 17px;
	}

	/* Many terms scroll sideways instead of squeezing the tabs */
	.tabs {
		position: relative;
		display: flex;
		gap: 4px;
		min-width: 0;
		overflow-x: auto;
		padding: 3px;
		background: var(--slot);
		border-radius: 12px;
		scrollbar-width: none;
	}

	.tabs button {
		min-width: 44px;
		height: 36px;
		flex-shrink: 0;
		padding: 0 8px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}

	.tabs button {
		position: relative;
	}

	.tabs button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}

	/* Once the mark is there it is the chosen tab's background */
	.tabs button.placed[aria-pressed='true'] {
		background: transparent;
		box-shadow: none;
	}

	.mark {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 0;
		border-radius: 9px;
		background: var(--surface);
		box-shadow: 0 1px 0 var(--line-strong);
	}

	@media (prefers-reduced-motion: no-preference) {
		.mark.moves {
			transition:
				transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1),
				width 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
	}
</style>
