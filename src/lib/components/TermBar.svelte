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
</script>

<div class="term-bar">
	<div class="term-title">
		<span class="year">{year}年度</span>
		<span class="group">{term?.groupName ?? term?.name ?? ''}</span>
	</div>
	<div class="tabs" role="group" aria-label="学期">
		{#each terms as t (t.id)}
			<button
				type="button"
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

	.tabs button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}
</style>
