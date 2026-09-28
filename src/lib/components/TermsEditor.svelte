<script lang="ts">
	import { TERMS_MAX, TERM_NAME_MAX, TERM_SYSTEMS, termSystemOf, termTemplate, type TermInput, type TermSystem } from '$lib/presets';
	import { termsProblem } from '$lib/terms';
	import { monthDay } from '$lib/time';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';

	let {
		terms = $bindable(),
		year,
		preset = null,
		name,
		open = $bindable(false),
		collapsible = true
	}: {
		terms: TermInput[];
		year: number;
		// The university's own terms, used when its system is picked
		preset?: TermInput[] | null;
		name?: string;
		open?: boolean;
		collapsible?: boolean;
	} = $props();

	const system = $derived(termSystemOf(terms));
	const problem = $derived(termsProblem(terms));

	function pick(next: TermSystem) {
		const fromPreset = preset && termSystemOf(preset) === next ? preset : null;
		terms = (fromPreset ?? termTemplate(next, year)).map((t) => ({ ...t, id: undefined }));
	}

	function set(i: number, patch: Partial<TermInput>) {
		terms = terms.map((t, j) => (j === i ? { ...t, ...patch } : t));
	}

	const range = (t: TermInput) => (t.start && t.end ? `${monthDay(t.start)}〜${monthDay(t.end)}` : '日付なし');
</script>

<div class="terms">
	<Segmented options={TERM_SYSTEMS} value={system} label="学期の区切り" onchange={pick} />

	{#if collapsible}
		<button type="button" class="summary" aria-expanded={open} onclick={() => (open = !open)}>
			<span class="text">
				{#each terms as t, i (i)}<span class="term"><b>{t.name}</b> {range(t)}</span>{/each}
			</span>
			<span class="toggle">{open ? 'とじる' : '日付を変える'}<Icon name="chevron" size={16} /></span>
		</button>
	{/if}

	{#if open || !collapsible}
		<div class="rows">
			{#each terms as t, i (i)}
				<div class="row">
					<div class="names">
						<label class="name">
							<span class="visually-hidden">{i + 1}つめの学期の名前</span>
							<input
								value={t.name}
								maxlength={TERM_NAME_MAX}
								placeholder="名前"
								oninput={(e) => set(i, { name: e.currentTarget.value })}
							/>
						</label>
						<label class="group">
							<span class="visually-hidden">{t.name}のまとまり（前期など）</span>
							<input
								value={t.group ?? ''}
								maxlength={TERM_NAME_MAX}
								placeholder="まとまり（前期など）"
								oninput={(e) => set(i, { group: e.currentTarget.value || null })}
							/>
						</label>
						<button
							type="button"
							class="remove"
							aria-label="{t.name}を消す"
							disabled={terms.length <= 1}
							onclick={() => (terms = terms.filter((_, j) => j !== i))}
						>
							<Icon name="close" size={16} />
						</button>
					</div>
					<div class="dates">
						<input
							type="date"
							value={t.start ?? ''}
							aria-label="{t.name}の始まり"
							onchange={(e) => set(i, { start: e.currentTarget.value || null })}
						/>
						<span>〜</span>
						<input
							type="date"
							value={t.end ?? ''}
							aria-label="{t.name}の終わり"
							onchange={(e) => set(i, { end: e.currentTarget.value || null })}
						/>
					</div>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class="add"
			disabled={terms.length >= TERMS_MAX}
			onclick={() => (terms = [...terms, { name: `学期${terms.length + 1}`, group: null, start: null, end: null }])}
		>
			<Icon name="plus" size={16} />学期を足す
		</button>
		{#if problem}<p class="error" role="alert">{problem}</p>{/if}
	{/if}
</div>
{#if name}<input type="hidden" {name} value={JSON.stringify(terms)} />{/if}

<style>
	.terms {
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
		padding: 8px 14px;
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
		flex-wrap: wrap;
		gap: 2px 10px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.term b {
		color: var(--ink);
	}

	.toggle {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		color: var(--ink-sub);
	}

	.summary[aria-expanded='true'] .toggle :global(.icon) {
		transform: rotate(90deg);
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
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
	}

	.row + .row {
		border-top: 1px solid var(--slot);
	}

	/* Grid tracks, since date inputs won't shrink below their text as flex items */
	.names {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 8fr) 38px;
		align-items: center;
		gap: 6px;
	}

	.dates {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 6px;
	}

	input {
		height: 38px;
		box-sizing: border-box;
		min-width: 0;
		padding: 0 8px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.name input,
	.group input,
	.dates input {
		width: 100%;
	}

	.dates span {
		color: var(--ink-sub);
	}

	.remove {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 9px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.remove:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.add {
		align-self: flex-start;
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

	.add:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
