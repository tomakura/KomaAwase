<script lang="ts">
	// Bars by day, in plain SVG. `points` are in date order; the labels under it are the first,
	// the middle and the last day.
	import { monthDay } from '$lib/time';

	let {
		points,
		label,
		unit = '人'
	}: { points: { date: string; n: number }[]; label: string; unit?: string } = $props();

	const W = 320;
	const H = 110;
	const max = $derived(Math.max(1, ...points.map((p) => p.n)));
	const step = $derived(W / points.length);
	const total = $derived(points.reduce((n, p) => n + p.n, 0));
	const ticks = $derived([0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => points[i]).filter(Boolean));
</script>

<figure>
	<svg viewBox="0 0 {W} {H + 18}" role="img" aria-label="{label}。この{points.length}日で合わせて{total}{unit}。多い日は{max}{unit}">
		<line x1="0" y1={H} x2={W} y2={H} class="axis" />
		{#each points as p, i (p.date)}
			{#if p.n}
				{@const h = Math.max(2, (p.n / max) * (H - 14))}
				<rect x={i * step + step * 0.15} y={H - h} width={step * 0.7} height={h} rx="1.5" />
			{/if}
		{/each}
		<text x="0" y="10" class="max">{max}{unit}</text>
		{#each ticks as t, i (t.date)}
			<text x={i === 0 ? 0 : i === 1 ? W / 2 : W} y={H + 14} text-anchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}>{monthDay(t.date)}</text>
		{/each}
	</svg>
</figure>

<style>
	figure {
		margin: 0;
		padding: 12px 14px 8px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
	}

	rect {
		fill: var(--ink);
	}

	.axis {
		stroke: var(--line-strong);
		stroke-width: 1;
	}

	text {
		fill: var(--ink-sub);
		font-size: 10px;
	}
</style>
