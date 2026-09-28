<script lang="ts">
	import type { Snippet } from 'svelte';

	// A sheet that slides up from the bottom, on the native <dialog> so focus and Escape work.
	let {
		open = $bindable(false),
		title,
		onclose,
		children
	}: { open?: boolean; title: string; onclose?: () => void; children: Snippet } = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(e) => {
		// A tap on the backdrop closes it.
		if (e.target === dialog) dialog.close();
	}}
>
	<div class="sheet">
		<div class="grabber"><span></span></div>
		<h2>{title}</h2>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		width: 100%;
		max-width: 480px;
		max-height: 88svh;
		margin: auto auto 0;
		padding: 0;
		border: none;
		border-radius: 22px 22px 0 0;
		background: var(--bg);
		color: var(--ink);
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--scrim), transparent 30%);
	}

	.sheet {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 0 16px calc(24px + env(safe-area-inset-bottom));
	}

	.grabber {
		display: flex;
		justify-content: center;
		padding: 8px 0 0;
	}

	.grabber span {
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: var(--line-strong);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 18px;
	}

	@media (prefers-reduced-motion: no-preference) {
		dialog[open] {
			animation: up 0.2s ease-out;
		}

		@keyframes up {
			from {
				transform: translateY(24px);
				opacity: 0.6;
			}
		}
	}
</style>
