<script lang="ts" generics="T extends string">
	// A row of buttons where one is chosen, like the term tabs.
	let {
		options,
		value = $bindable(),
		label,
		name,
		onchange
	}: {
		options: readonly { id: T; label: string }[];
		value: T | null;
		label: string;
		name?: string;
		onchange?: (value: T) => void;
	} = $props();
</script>

<div class="segmented" role="group" aria-label={label}>
	{#each options as option (option.id)}
		<button
			type="button"
			aria-pressed={value === option.id}
			onclick={() => {
				value = option.id;
				onchange?.(option.id);
			}}>{option.label}</button
		>
	{/each}
</div>
{#if name}<input type="hidden" {name} value={value ?? ''} />{/if}

<style>
	.segmented {
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--slot);
	}

	button {
		flex: 1 1 0;
		min-width: 0;
		height: 38px;
		padding: 0 4px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}
</style>
