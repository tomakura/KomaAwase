<script lang="ts">
	import { DAY_NAMES, courseColor, courseHref, deliveryLabel, periodLabel, timetableHref } from '$lib/courses';

	let { data } = $props();

	const course = $derived(data.course);
	const periodNumbers = $derived(data.periods.map((p) => p.number));
	const slotLabels = $derived(
		course.slots.map((s) => `${DAY_NAMES[s.weekday]} ${periodLabel(s.period, s.span, periodNumbers)}`)
	);
	const termNames = $derived(
		data.terms
			.filter((t) => course.termIds.includes(t.id))
			.map((t) => t.name)
			.join('・')
	);
	const delivery = $derived(deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo));
</script>

<svelte:head>
	<title>{course.title} · コマあわせ</title>
</svelte:head>

<div class="page">
	<a class="scrim" href={timetableHref(data.termParam)} aria-label="閉じて時間割にもどる"></a>

	<div class="sheet">
		<div class="grabber"><span></span></div>

		<div class="head">
			<div class="title-row">
				<div class="name">
					<span class="bar" style:--c={courseColor(course.color)}></span>
					<h1>{#each course.titleParts as part, k}{#if k}<wbr />{/if}{part}{/each}</h1>
				</div>
				<a class="edit" href={courseHref(course.id, data.termParam, '/edit')}>
					<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z" />
					</svg>
					編集
				</a>
			</div>
			<div class="chips">
				{#each course.slots as slot, i (i)}
					<span class="chip"><b>{slotLabels[i]}</b>{#if slot.room}&nbsp;· {slot.room}{/if}</span>
				{/each}
				{#if delivery}<span class="chip"><b>{delivery}</b></span>{/if}
				{#if termNames}<span class="chip muted">{termNames}</span>{/if}
				{#if course.syncMode === 'synced' && data.shared}
					<span class="chip muted synced">
						<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
						</svg>
						みんなと同期中
					</span>
				{/if}
			</div>
			{#if course.teachers.length}
				<span class="teachers">{course.teachers.join('・')}</span>
			{/if}
		</div>

		{#if slotLabels.length > 1}
			<p class="note">
				{slotLabels.map((l) => l.replace(' ', '')).join('・')}の{slotLabels.length === 2 ? 'どちら' : 'どれ'}から開いても、同じ内容が見られます。
			</p>
		{/if}
	</div>
</div>

<style>
	.page {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		background: var(--scrim);
	}

	.scrim {
		height: 52px;
		flex-shrink: 0;
	}

	.sheet {
		flex-grow: 1;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding-bottom: 32px;
		box-sizing: border-box;
		background: var(--bg);
		border-radius: 22px 22px 0 0;
	}

	.grabber {
		display: flex;
		justify-content: center;
		padding: 8px 0 4px;
	}

	.grabber span {
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: var(--line-strong);
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px 16px 14px;
	}

	.title-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.name {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.bar {
		width: 14px;
		height: 36px;
		flex-shrink: 0;
		box-sizing: border-box;
		border-radius: 5px;
		border: 1px solid color-mix(in oklab, var(--c), var(--ink) 15%);
		background: var(--c);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.edit {
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 10px;
		color: var(--ink);
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		padding: 3px 9px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface);
		font-size: 12px;
	}

	.chip.muted {
		border-color: transparent;
		background: var(--slot);
	}

	.synced {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.synced svg {
		stroke-width: 2;
	}

	.teachers {
		font-size: 13px;
		color: var(--ink-soft);
	}

	.note {
		margin: 0;
		padding: 14px 16px 0;
		font-size: 11px;
		line-height: 1.6;
		color: var(--ink-sub);
	}
</style>
