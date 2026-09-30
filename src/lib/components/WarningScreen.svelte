<script lang="ts">
	import { WARNING_WAIT_SECONDS } from '$lib/moderation';

	// A warning from the admin, over the whole screen. The button can't be pressed for the first
	// seconds. With `preview` it is drawn as a card, as the admin sees a draft, and does nothing.
	let {
		id,
		body,
		preview = false,
		onack
	}: { id: string; body: string; preview?: boolean; onack?: () => void } = $props();

	let left = $state(WARNING_WAIT_SECONDS);
	let busy = $state(false);

	// Counts again for each warning shown
	$effect(() => {
		void id;
		left = WARNING_WAIT_SECONDS;
		if (preview) return;
		const timer = setInterval(() => {
			left -= 1;
			if (left <= 0) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	});

	const waiting = $derived(left > 0);
</script>

<div class="warning" class:preview role={preview ? undefined : 'alertdialog'} aria-modal={preview ? undefined : 'true'} aria-labelledby="warning-title-{id}">
	<div class="band">
		<svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="9.5" />
			<path d="M12 7v6.2M12 16.6h.01" />
		</svg>
	</div>
	<div class="content">
		<h1 id="warning-title-{id}">運営からの警告</h1>
		<p class="text">{body}</p>
	</div>
	<div class="foot">
		<button
			type="button"
			disabled={preview || waiting || busy}
			onclick={() => {
				busy = true;
				onack?.();
			}}
		>
			{preview || waiting ? `理解しました（${left}）` : '理解しました'}
		</button>
	</div>
</div>

<style>
	.warning {
		--band: #b3261e;
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--ink);
		overflow-y: auto;
	}

	.warning.preview {
		position: relative;
		inset: auto;
		z-index: auto;
		max-height: 420px;
		border: 1px solid var(--line-strong);
		border-radius: 16px;
		overflow: hidden;
	}

	.band {
		flex-shrink: 0;
		display: flex;
		justify-content: center;
		padding: max(28px, env(safe-area-inset-top)) 0 24px;
		background: var(--band);
		color: #fff;
	}

	.band svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.content {
		width: 100%;
		max-width: 480px;
		box-sizing: border-box;
		margin: 0 auto;
		flex-grow: 1;
		padding: 28px 24px 12px;
	}

	h1 {
		margin: 0 0 16px;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
	}

	.text {
		margin: 0;
		font-size: 15px;
		line-height: 1.8;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.foot {
		width: 100%;
		max-width: 480px;
		box-sizing: border-box;
		margin: 0 auto;
		padding: 12px 24px max(28px, env(safe-area-inset-bottom));
	}

	button {
		width: 100%;
		min-height: 52px;
		border: none;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-family: inherit;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .warning {
			--band: #8f2a24;
		}
	}

	:global(:root[data-theme='dark']) .warning {
		--band: #8f2a24;
	}
</style>
