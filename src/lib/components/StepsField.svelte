<script lang="ts">
	import { STEPS_MAX, STEP_TEXT_MAX, type TaskStep } from '$lib/tasks';

	// The steps of a homework in its form: one field each, sent as `step` with `stepDone` beside it
	let { steps = [] }: { steps?: TaskStep[] | null } = $props();

	let key = 0;
	// svelte-ignore state_referenced_locally
	let rows = $state((steps ?? []).map((s) => ({ ...s, key: key++ })));
	let message = $state<string | null>(null);

	function add() {
		if (rows.length >= STEPS_MAX) return (message = `チェック項目は${STEPS_MAX}個までです`);
		message = null;
		rows.push({ text: '', done: false, key: key++ });
	}
</script>

<div class="steps">
	<span class="label">チェック項目（任意）</span>
	{#each rows as row, i (row.key)}
		<div class="step">
			<input name="step" bind:value={row.text} maxlength={STEP_TEXT_MAX} autocomplete="off" aria-label="チェック項目{i + 1}" placeholder="調べる" />
			<input type="hidden" name="stepDone" value={row.done ? '1' : '0'} />
			<button type="button" class="remove" aria-label="チェック項目{i + 1}を消す" onclick={() => rows.splice(i, 1)}>
				<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>
	{/each}
	<button type="button" class="more" onclick={add}>＋ 項目を足す</button>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
</div>

<style>
	.steps {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.step {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.step input {
		flex: 1;
		min-width: 0;
		height: 44px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.remove {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.remove svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}

	.more {
		align-self: flex-start;
		padding: 6px 10px;
		border: 1px dashed var(--line-bold);
		border-radius: 10px;
		background: none;
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}
</style>
