<script lang="ts">
	import { confirmation } from '$lib/confirm.svelte';

	// A small card in the middle of the screen, on the native <dialog> so focus stays inside.
	// Escape or a tap outside cancels; the cancel button has the focus to begin with.
	let dialog = $state<HTMLDialogElement>();
	let cancelButton = $state<HTMLButtonElement>();
	const open = $derived(confirmation.current);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			cancelButton?.focus();
		}
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="confirm-message"
	oncancel={(e) => {
		e.preventDefault();
		open?.answer(false);
	}}
	onclick={(e) => {
		if (e.target === dialog) open?.answer(false);
	}}
>
	{#if open}
		<div class="card">
			<p id="confirm-message">{open.message}</p>
			<div class="actions">
				<button bind:this={cancelButton} class="btn" type="button" onclick={() => open.answer(false)}>やめる</button>
				<button class="btn" class:btn-primary={!open.danger} class:danger={open.danger} type="button" onclick={() => open.answer(true)}
					>{open.ok}</button
				>
			</div>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: calc(100% - 48px);
		max-width: 360px;
		margin: auto;
		padding: 0;
		border: none;
		border-radius: 20px;
		background: var(--bg);
		color: var(--ink);
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--scrim), transparent 30%);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px 20px 20px;
	}

	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.7;
		white-space: pre-line;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.btn {
		min-height: 48px;
		padding: 0 12px;
	}

	.danger {
		border-color: var(--accent-text);
		background: var(--accent-text);
		color: var(--surface);
	}

	@media (prefers-reduced-motion: no-preference) {
		dialog[open] {
			animation: pop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
		}

		dialog[open]::backdrop {
			animation: fade 0.18s ease-out;
		}

		@keyframes pop {
			from {
				opacity: 0;
				transform: scale(0.96);
			}
		}

		@keyframes fade {
			from {
				opacity: 0;
			}
		}
	}
</style>
