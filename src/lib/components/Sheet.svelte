<script lang="ts">
	import type { Snippet } from 'svelte';
	import { still } from '$lib/motion';
	import { swipeDown } from '$lib/swipe';

	// A sheet that slides up from the bottom, on the native <dialog> so focus and Escape work.
	let {
		open = $bindable(false),
		title,
		onclose,
		children
	}: { open?: boolean; title: string; onclose?: () => void; children: Snippet } = $props();

	let dialog = $state<HTMLDialogElement>();
	let closing = $state(false);

	// Slides down first, as it slid up (a pull down has already moved it away: see swipeDown)
	function dismiss() {
		if (!dialog?.open || closing) return;
		if (still()) return dialog.close();
		closing = true;
		setTimeout(() => {
			closing = false;
			dialog?.close();
		}, 200);
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dismiss();
	});
</script>

<dialog
	bind:this={dialog}
	class:closing
	use:swipeDown={() => dialog?.close()}
	aria-label={title}
	oncancel={(e) => {
		// Escape
		e.preventDefault();
		dismiss();
	}}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(e) => {
		// A tap on the backdrop closes it.
		if (e.target === dialog) dismiss();
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
			animation: up 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
		}

		dialog[open]::backdrop {
			animation: fade 0.24s ease-out;
		}

		dialog.closing {
			animation: down 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
		}

		dialog.closing::backdrop {
			animation: fade-out 0.2s ease-in forwards;
		}

		@keyframes fade-out {
			to {
				opacity: 0;
			}
		}

		@keyframes down {
			to {
				transform: translateY(100%);
			}
		}

		@keyframes fade {
			from {
				opacity: 0;
			}
		}

		@keyframes up {
			from {
				transform: translateY(100%);
			}
		}
	}
</style>
