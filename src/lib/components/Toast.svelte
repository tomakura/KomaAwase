<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { motion } from '$lib/motion';
	import { toast } from '$lib/toast.svelte';

	let busy = $state(false);

	async function press() {
		const action = toast.current?.action;
		if (!action) return;
		busy = true;
		toast.hide();
		try {
			await action.run();
		} finally {
			busy = false;
		}
	}
</script>

{#if toast.current}
	{#key toast.current.key}
		<div class="toast" class:plain={!toast.current.action} role="status" in:fly|global={{ ...motion(200), y: 8 }} out:fade|global={motion(150)}>
			<span>{toast.current.text}</span>
			{#if toast.current.action}
				<button type="button" disabled={busy} onclick={press}>{toast.current.action.label}</button>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 16px;
		width: max-content;
		max-width: min(440px, calc(100vw - 32px));
		box-sizing: border-box;
		padding: 8px 8px 8px 16px;
		border-radius: 12px;
		background: var(--ink);
		color: var(--bg);
		font-size: 13px;
		transform: translateX(-50%);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
	}

	.toast.plain {
		padding: 12px 16px;
	}

	button {
		min-height: 36px;
		padding: 0 12px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--bg);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
