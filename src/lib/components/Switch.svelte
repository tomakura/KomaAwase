<script lang="ts">
	// An on/off switch. With `name`, the form gets "on" or "off".
	let {
		checked = $bindable(false),
		labelledby,
		label,
		name,
		disabled = false,
		onchange
	}: {
		checked?: boolean;
		labelledby?: string;
		label?: string;
		name?: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-labelledby={labelledby}
	aria-label={label}
	{disabled}
	onclick={() => {
		checked = !checked;
		onchange?.(checked);
	}}
><span></span></button>
{#if name}<input type="hidden" {name} value={checked ? 'on' : 'off'} />{/if}

<style>
	button {
		position: relative;
		width: 48px;
		height: 28px;
		flex-shrink: 0;
		padding: 0;
		border: none;
		border-radius: 14px;
		background: var(--switch-off);
		cursor: pointer;
		transition: background 0.15s;
	}

	button[aria-checked='true'] {
		background: var(--ink);
	}

	span {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 22px;
		height: 22px;
		border-radius: 11px;
		background: var(--surface);
		transition: left 0.15s;
	}

	button[aria-checked='true'] span {
		left: 23px;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		button,
		span {
			transition: none;
		}
	}
</style>
