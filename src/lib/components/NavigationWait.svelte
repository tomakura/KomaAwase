<script lang="ts">
	import { navigating } from '$app/state';

	// A ring in the middle of the screen while the next page is awaited. The page stays as it
	// was (going back is instant, and a quick load shouldn't flash anything), so it shows only
	// once the wait has gone on for a moment.
	const DELAY = 400;
	let shown = $state(false);
	$effect(() => {
		if (!navigating.to) {
			shown = false;
			return;
		}
		const timer = setTimeout(() => (shown = true), DELAY);
		return () => clearTimeout(timer);
	});
</script>

{#if shown}
	<div class="wait" role="status" aria-label="読み込み中"><i></i></div>
{/if}

<style>
	.wait {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 50;
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: -32px 0 0 -32px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
		/* The page under it can still be pressed, to go elsewhere instead */
		pointer-events: none;
	}

	i {
		width: 32px;
		height: 32px;
		box-sizing: border-box;
		border: 4px solid var(--line);
		border-top-color: var(--shu);
		border-radius: 50%;
		animation: turn 0.9s linear infinite;
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		i {
			animation: pulse 1.6s ease-in-out infinite;
		}

		@keyframes pulse {
			50% {
				opacity: 0.35;
			}
		}
	}
</style>
