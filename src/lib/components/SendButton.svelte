<script lang="ts">
	import type { Snippet } from 'svelte';

	// A submit button that shows the sending: a wheel turns while it goes, then the wheel becomes
	// a check mark that is drawn (the page shows what was sent after that, see src/lib/send.ts).
	let {
		phase,
		class: className = 'btn',
		disabled = false,
		children
	}: { phase: 'idle' | 'sending' | 'done'; class?: string; disabled?: boolean; children: Snippet } = $props();
</script>

<button class={className} type="submit" disabled={disabled || phase !== 'idle'} aria-busy={phase === 'sending'} data-phase={phase}>
	{#if phase === 'sending'}
		<span class="wheel" aria-hidden="true"></span>
		<span class="sr">送信中</span>
	{:else if phase === 'done'}
		<svg class="check" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
		</svg>
		<span class="sr">送信しました</span>
	{:else}
		{@render children()}
	{/if}
</button>

<style>
	/* Kept at full strength: it is busy, not unavailable */
	button[data-phase='sending']:disabled,
	button[data-phase='done']:disabled {
		opacity: 1;
	}

	.wheel {
		width: 22px;
		height: 22px;
		box-sizing: border-box;
		border: 2.5px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: turn 0.7s linear infinite;
	}

	.check {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		animation: draw 0.35s ease-out both;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wheel {
			animation-duration: 2s;
		}

		.check {
			animation: none;
		}
	}
</style>
