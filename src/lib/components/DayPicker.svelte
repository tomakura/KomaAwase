<script lang="ts">
	import { DAY_NAMES } from '$lib/courses';

	// Days shown in the timetable, 1 = Monday ... 7 = Sunday. At least one stays on.
	let {
		days = $bindable(),
		name,
		onchange
	}: { days: number[]; name?: string; onchange?: (days: number[]) => void } = $props();

	function toggle(day: number) {
		if (days.includes(day)) {
			if (days.length === 1) return;
			days = days.filter((d) => d !== day);
		} else {
			days = [...days, day].sort((a, b) => a - b);
		}
		onchange?.(days);
	}
</script>

<div class="days" role="group" aria-label="表示する曜日">
	{#each [1, 2, 3, 4, 5, 6, 7] as day (day)}
		<button type="button" aria-pressed={days.includes(day)} aria-label="{DAY_NAMES[day]}曜日" onclick={() => toggle(day)}>
			{DAY_NAMES[day]}
		</button>
	{/each}
</div>
{#if name}<input type="hidden" {name} value={JSON.stringify(days)} />{/if}

<style>
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}

	button {
		height: 44px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
		font-weight: 700;
	}
</style>
