<script lang="ts">
	import {
		DEFAULT_PERIOD_PATTERN,
		PERIODS_MAX,
		generatePeriods,
		hhmm,
		periodsProblem,
		periodsSummary,
		type PeriodInput,
		type PeriodPattern
	} from '$lib/presets';
	import { toMinutes } from '$lib/time';
	import Icon from './Icon.svelte';

	let {
		periods = $bindable(),
		usedNumbers = [],
		name,
		open = $bindable(false),
		collapsible = true
	}: {
		periods: PeriodInput[];
		// Period numbers that have courses, to warn before one is dropped
		usedNumbers?: number[];
		name?: string;
		open?: boolean;
		collapsible?: boolean;
	} = $props();

	const summary = $derived(periodsSummary(periods));
	const problem = $derived(periodsProblem(periods));
	const dropped = $derived(
		[...new Set(usedNumbers)].filter((n) => !periods.some((p) => p.number === n)).sort((a, b) => a - b)
	);

	function setTime(i: number, key: 'start' | 'end', value: string) {
		periods = periods.map((p, j) => (j === i ? { ...p, [key]: value } : p));
	}

	// The next period starts after the same break as the last two, and is as long as the last one.
	function addPeriod() {
		const last = periods.at(-1);
		if (!last) {
			periods = generatePeriods({ ...DEFAULT_PERIOD_PATTERN, count: 1 });
			return;
		}
		const prev = periods.at(-2);
		const gap = prev ? Math.max(0, toMinutes(last.start) - toMinutes(prev.end)) : 10;
		const length = toMinutes(last.end) - toMinutes(last.start);
		const start = Math.min(toMinutes(last.end) + gap, 23 * 60);
		periods = [...periods, { number: last.number + 1, start: hhmm(start), end: hhmm(Math.min(start + length, 23 * 60 + 59)) }];
	}

	function toggleZero() {
		if (periods[0]?.number === 0) {
			periods = periods.slice(1);
		} else {
			const first = periods[0];
			const length = first ? toMinutes(first.end) - toMinutes(first.start) : 90;
			const end = first ? Math.max(0, toMinutes(first.start) - 10) : 9 * 60;
			periods = [{ number: 0, start: hhmm(Math.max(0, end - length)), end: hhmm(end) }, ...periods];
		}
	}

	// The pattern the current periods follow: the longest break is taken as lunch.
	function patternOf(list: PeriodInput[]): PeriodPattern {
		const [first, second] = list;
		if (!first) return { ...DEFAULT_PERIOD_PATTERN };
		const gaps = list.slice(1).map((p, i) => ({ after: list[i].number, minutes: toMinutes(p.start) - toMinutes(list[i].end) }));
		const gap = second ? Math.max(0, toMinutes(second.start) - toMinutes(first.end)) : DEFAULT_PERIOD_PATTERN.gap;
		const longest = gaps.toSorted((a, b) => b.minutes - a.minutes)[0];
		const lunch = longest && longest.minutes > gap ? longest : null;
		return {
			first: first.number,
			count: list.length,
			start: first.start,
			length: toMinutes(first.end) - toMinutes(first.start),
			gap: lunch?.after === first.number && list[2] ? Math.max(0, toMinutes(list[2].start) - toMinutes(list[1].end)) : gap,
			lunchAfter: lunch?.after ?? null,
			lunch: lunch?.minutes ?? DEFAULT_PERIOD_PATTERN.lunch
		};
	}

	let pattern = $state<PeriodPattern>({ ...DEFAULT_PERIOD_PATTERN });
	let showPattern = $state(false);

	function togglePattern() {
		if (!showPattern) pattern = patternOf(periods);
		showPattern = !showPattern;
	}

	function regenerate() {
		periods = generatePeriods(pattern);
		showPattern = false;
	}

	const time = (t: string) => t.replace(/^0/, '');
</script>

<div class="periods">
	{#if collapsible}
		<button type="button" class="summary" aria-expanded={open} onclick={() => (open = !open)}>
			<span class="text">
				<span class="title">{summary.title}</span>
				<span class="detail">{summary.detail}</span>
			</span>
			<span class="toggle">{open ? 'とじる' : '変える'}<Icon name="chevron" size={16} /></span>
		</button>
	{/if}

	{#if open || !collapsible}
		<div class="editor">
			<div class="rows">
				{#each periods as p, i (p.number)}
					<div class="row">
						<span class="number">{p.number}限</span>
						<input
							type="time"
							value={p.start}
							aria-label="{p.number}限の始まり"
							onchange={(e) => setTime(i, 'start', e.currentTarget.value)}
						/>
						<span class="dash">〜</span>
						<input
							type="time"
							value={p.end}
							aria-label="{p.number}限の終わり"
							onchange={(e) => setTime(i, 'end', e.currentTarget.value)}
						/>
						<span class="length">{Math.max(0, toMinutes(p.end) - toMinutes(p.start))}分</span>
					</div>
				{/each}
			</div>

			<div class="buttons">
				<button type="button" class="small" onclick={addPeriod} disabled={periods.length >= PERIODS_MAX}>
					<Icon name="plus" size={16} />{periods.at(-1) ? `${periods.at(-1)!.number + 1}限を足す` : '時限を足す'}
				</button>
				<button type="button" class="small" onclick={() => (periods = periods.slice(0, -1))} disabled={periods.length <= 1}>
					<Icon name="minus" size={16} />最後の時限を消す
				</button>
				<button type="button" class="small" onclick={toggleZero}>
					{periods[0]?.number === 0 ? '0限をなくす' : '0限を足す'}
				</button>
				<button type="button" class="small" aria-expanded={showPattern} onclick={togglePattern}>
					まとめて作り直す
				</button>
			</div>

			{#if showPattern}
				<div class="pattern">
					<label>
						1限の始まり
						<input type="time" bind:value={pattern.start} />
					</label>
					<label>
						時限の数
						<input type="number" min="1" max={PERIODS_MAX} bind:value={pattern.count} />
					</label>
					<label>
						1コマ
						<span class="with-unit"><input type="number" min="10" max="240" step="5" bind:value={pattern.length} />分</span>
					</label>
					<label>
						休み時間
						<span class="with-unit"><input type="number" min="0" max="120" step="5" bind:value={pattern.gap} />分</span>
					</label>
					<div class="lunch">
						<span id="lunch-label">昼休み</span>
						<span class="with-unit" role="group" aria-labelledby="lunch-label">
							<input type="number" min="0" max={PERIODS_MAX} bind:value={pattern.lunchAfter} aria-label="昼休みの前の時限" />限のあと
							<input type="number" min="0" max="180" step="5" bind:value={pattern.lunch} aria-label="昼休みの長さ" />分
						</span>
					</div>
					<button type="button" class="btn" onclick={regenerate}>
						{time(pattern.start)}から{pattern.count}コマで作る
					</button>
				</div>
			{/if}

			{#if problem}<p class="error" role="alert">{problem}</p>{/if}
			{#if dropped.length}
				<p class="warn">
					{dropped.map((n) => `${n}限`).join('・')}に授業があります。時間割には出なくなりますが、授業は消えません。
				</p>
			{/if}
		</div>
	{/if}
</div>
{#if name}<input type="hidden" {name} value={JSON.stringify(periods)} />{/if}

<style>
	.periods {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.summary {
		min-height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		font-size: 14px;
		font-weight: 700;
	}

	.detail {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		color: var(--ink-sub);
	}

	.summary[aria-expanded='true'] .toggle :global(.icon) {
		transform: rotate(90deg);
	}

	.editor {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.rows {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.row {
		min-height: 48px;
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr) auto minmax(0, 1fr) 40px;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
	}

	.row + .row {
		border-top: 1px solid var(--slot);
	}

	.number {
		width: 36px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 14px;
	}

	input {
		height: 38px;
		box-sizing: border-box;
		padding: 0 8px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.row input {
		width: 100%;
	}

	.dash {
		color: var(--ink-sub);
	}

	.length {
		text-align: right;
		font-size: 12px;
		color: var(--ink-sub);
		white-space: nowrap;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.small {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.small:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.pattern {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.pattern label,
	.lunch {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.lunch {
		grid-column: 1 / -1;
	}

	.pattern input {
		width: 100%;
	}

	.with-unit {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--ink);
		white-space: nowrap;
	}

	.with-unit input {
		min-width: 0;
	}

	.pattern .btn {
		grid-column: 1 / -1;
		min-height: 44px;
	}

	.warn {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-soft);
	}
</style>
