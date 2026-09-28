<script lang="ts">
	import { page } from '$app/state';

	let { current }: { current: 'timetable' | 'overlay' | 'friends' | 'more' } = $props();

	// Friend requests waiting for an answer, from the root layout
	const pending = $derived(Number(page.data.pendingRequests ?? 0));
</script>

<nav aria-label="メニュー">
	<a href="/" aria-current={current === 'timetable' ? 'page' : undefined}>
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3.5" y="3.5" width="17" height="17" rx="3" />
			<path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
		</svg>
		時間割
	</a>
	<a href="/overlay" aria-current={current === 'overlay' ? 'page' : undefined}>
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3.5" y="3.5" width="11" height="11" rx="2.5" />
			<rect x="9.5" y="9.5" width="11" height="11" rx="2.5" />
		</svg>
		重ねる
	</a>
	<a href="/friends" aria-current={current === 'friends' ? 'page' : undefined}>
		<span class="icon">
			<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="9" cy="8" r="3.5" />
				<path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
				<path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.8c2 .7 3.4 2.4 4 5.2" />
			</svg>
			{#if pending}<span class="badge" aria-label="申請{pending}件">{pending > 9 ? '9+' : pending}</span>{/if}
		</span>
		友だち
	</a>
	<a href="/more" aria-current={current === 'more' ? 'page' : undefined}>
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="5" cy="12" r="1.3" />
			<circle cx="12" cy="12" r="1.3" />
			<circle cx="19" cy="12" r="1.3" />
		</svg>
		その他
	</a>
</nav>

<style>
	nav {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		padding: 8px 8px max(22px, env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--line);
	}

	nav > a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 0;
		color: var(--ink-sub);
		font-size: 11px;
		text-decoration: none;
	}

	[aria-current='page'] {
		color: var(--accent-text);
		font-weight: 700;
	}

	.icon {
		position: relative;
		display: flex;
	}

	.badge {
		position: absolute;
		top: -4px;
		right: -9px;
		min-width: 18px;
		height: 18px;
		box-sizing: border-box;
		padding: 0 5px;
		border-radius: 9px;
		border: 2px solid var(--surface);
		background: var(--shu);
		color: #fffdf8;
		font-size: 10px;
		font-weight: 700;
		line-height: 14px;
		text-align: center;
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
