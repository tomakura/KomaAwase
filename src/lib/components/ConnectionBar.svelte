<script lang="ts">
	import { fade, fly, slide } from 'svelte/transition';
	import Icon from './Icon.svelte';
	import { connection } from '$lib/connection.svelte';
	import { motion } from '$lib/motion';
	import { savedAtLabel } from '$lib/sync';

	// The strip at the top while the app is offline or the connection is poor (and while the
	// copies are being refreshed, if that takes a moment), with when the information on screen
	// was fetched and a button to try again. Also the message shown when something that needs the
	// server is pressed.
	const link = $derived(connection.link);
	const busy = $derived(connection.phase !== 'idle');
	const progress = $derived(connection.phase === 'syncing' ? connection.progress : null);
	const fetched = $derived(connection.shownAt ? savedAtLabel(connection.shownAt, Date.now()) : null);

	const mode = $derived(link !== 'online' ? link : connection.recovered ? 'recovered' : 'syncing');
	const title = $derived(
		{ offline: 'オフライン', poor: '通信が不安定です', recovered: 'オンラインに復帰しました', syncing: '時間割を同期中' }[mode]
	);
	const detail = $derived(
		mode === 'recovered'
			? '最新の情報に更新しました'
			: mode === 'syncing'
				? null
				: fetched
					? `${fetched} の情報を表示しています`
					: null
	);
	const step = $derived(
		connection.phase === 'checking'
			? '接続を確認中…'
			: progress
				? progress.done >= progress.total
					? '同期しました'
					: `${progress.label}を同期中 · ${progress.done + 1}/${progress.total}`
				: null
	);

	// The page's minimum height gives up the strip's height (--bar-h, see src/app.css), so that
	// showing it doesn't make the page scroll. It follows the strip while it slides.
	let height = $state(0);
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--bar-h', `${height}px`);
		return () => root.style.removeProperty('--bar-h');
	});
</script>

{#if connection.visible}
	<div
		class="bar {mode}"
		bind:offsetHeight={height}
		aria-live="polite"
		transition:slide={motion(260)}
		onoutroend={() => (height = 0)}
	>
		<div class="inner">
			<div class="row">
				<Icon name={mode === 'recovered' ? 'check' : mode === 'syncing' ? 'sync' : 'offline'} size={20} />
				<div class="text">
					<b>{title}</b>
					{#if detail}<span>{detail}</span>{/if}
					{#if link !== 'online'}<a class="status-link" href="/status">稼働状況を見る</a>{/if}
				</div>
				{#if link !== 'online'}
					<button class="refresh" type="button" onclick={() => connection.refresh()} disabled={busy} aria-label="最新の情報に更新">
						<span class="turn" class:spin={busy}><Icon name="sync" size={20} /></span>
					</button>
				{/if}
			</div>
			{#if busy && step}
				<div class="step" transition:slide={motion(260)}>
					<span>{step}</span>
					{#if progress}
						<div class="track" role="progressbar" aria-label="同期の進み具合" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
							<div class="fill" style:width="{(progress.done / progress.total) * 100}%"></div>
						</div>
					{:else}
						<div class="track"><div class="fill wait"></div></div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if connection.notice}
	{#key connection.notice.id}
		<!-- Global: the whole block goes when the notice does -->
		<p class="toast" role="status" in:fly|global={{ ...motion(200), y: 8 }} out:fade|global={motion(150)}>
			{connection.notice.text}
		</p>
	{/key}
{/if}

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--course-blue);
		color: var(--ink);
		border-bottom: 1px solid var(--line-strong);
	}

	@media (prefers-reduced-motion: no-preference) {
		.bar {
			transition:
				background-color 0.3s,
				color 0.3s,
				border-color 0.3s;
		}
	}

	.bar.offline {
		background: var(--ink);
		color: var(--bg);
		border-bottom-color: var(--ink);
	}

	.bar.poor {
		background: var(--course-orange);
	}

	.bar.recovered {
		background: var(--course-green);
	}

	.inner {
		max-width: 480px;
		margin: 0 auto;
		padding: 6px 8px 8px 16px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}

	.text {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.text b {
		font-size: 13px;
	}

	.text span {
		font-size: 12px;
		line-height: 1.5;
		opacity: 0.85;
	}

	.status-link {
		align-self: flex-start;
		font-size: 12px;
		color: inherit;
	}

	.refresh {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: 12px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	/* It stays as it is while it turns */
	.refresh:disabled {
		cursor: default;
		opacity: 1;
	}

	.turn {
		display: flex;
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 0 8px 2px 0;
		font-size: 12px;
	}

	.track {
		height: 4px;
		overflow: hidden;
		border-radius: 2px;
		background: color-mix(in srgb, currentColor 20%, transparent);
	}

	.fill {
		height: 100%;
		border-radius: 2px;
		background: currentColor;
	}

	/* Not knowing how long it will take: a piece that travels along */
	.fill.wait {
		width: 35%;
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 60;
		width: max-content;
		max-width: min(440px, calc(100vw - 32px));
		box-sizing: border-box;
		margin: 0;
		padding: 12px 16px;
		border-radius: 12px;
		background: var(--ink);
		color: var(--bg);
		font-size: 13px;
		line-height: 1.6;
		text-align: center;
		transform: translateX(-50%);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
	}

	@media (prefers-reduced-motion: no-preference) {
		.spin {
			animation: spin 1s linear infinite;
		}

		.fill {
			transition: width 0.3s ease-out;
		}

		.fill.wait {
			animation: wait 1.4s ease-in-out infinite;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		@keyframes wait {
			from {
				transform: translateX(-100%);
			}
			to {
				transform: translateX(300%);
			}
		}
	}
</style>
