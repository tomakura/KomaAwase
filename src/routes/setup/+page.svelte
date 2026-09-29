<script lang="ts">
	import { enhance } from '$app/forms';
	import DayPicker from '$lib/components/DayPicker.svelte';
	import PeriodsEditor from '$lib/components/PeriodsEditor.svelte';
	import TermsEditor from '$lib/components/TermsEditor.svelte';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let university = $state(data.universityName);
	// svelte-ignore state_referenced_locally
	let terms = $state(data.terms);
	// svelte-ignore state_referenced_locally
	let periods = $state(data.periods);
	// svelte-ignore state_referenced_locally
	let days = $state(data.days);
	let saving = $state(false);

	const normalized = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim();
	const preset = $derived(data.presets.find((p) => p.name === normalized(university)) ?? null);
	// svelte-ignore state_referenced_locally
	let appliedFor = $state<string | null>(preset?.name ?? null);

	// Picking a university with a preset fills in its terms and periods once.
	$effect(() => {
		if (preset && appliedFor !== preset.name) {
			terms = preset.terms.map((t) => ({ ...t }));
			periods = preset.periods.map((p) => ({ ...p }));
			appliedFor = preset.name;
		}
	});
</script>

<svelte:head>
	<title>はじめの設定 · コマあわせ</title>
</svelte:head>

<main>
	<header>
		<h1>はじめの設定</h1>
		<p>はじめに時間割の形を決めます。あとから「その他」で変更できます。</p>
	</header>

	<form
		method="POST"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
	>
		<div class="field">
			<label for="university">大学</label>
			<input
				id="university"
				name="university"
				list="universities"
				bind:value={university}
				maxlength="40"
				autocomplete="organization"
				placeholder="〇〇大学"
			/>
			<datalist id="universities">
				{#each data.universities as name (name)}<option value={name}></option>{/each}
			</datalist>
			<span class="hint">
				{#if preset}
					{preset.name}の学期と時限の時刻を入れました。
				{:else if normalized(university)}
					学期と時限は下で決めてください。同じ大学の人とは、授業のデータを共有できます。
				{:else}
					登録されている大学なら、学期と時限の時刻を自動で入れます。
				{/if}
			</span>
		</div>

		<div class="field">
			<span class="label">学期の区切り</span>
			<TermsEditor bind:terms year={data.year} preset={preset?.terms ?? null} name="terms" />
			{#if !preset}
				<span class="hint">学期の日付は目安です。大学の日程に合わせて直してください。</span>
			{/if}
		</div>

		<div class="field">
			<span class="label">時限と時刻</span>
			<PeriodsEditor bind:periods usedNumbers={data.usedPeriods} name="periods" />
		</div>

		<div class="field">
			<span class="label">表示する曜日</span>
			<DayPicker bind:days name="days" />
		</div>

		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary start" type="submit" disabled={saving}>{saving ? '保存中…' : 'はじめる'}</button>
	</form>
</main>

<style>
	main {
		max-width: 480px;
		min-height: var(--page-h);
		box-sizing: border-box;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: 0 16px 28px;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 22px 4px 4px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
	}

	header p {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	form {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-top: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	label,
	.label {
		font-size: 12px;
		color: var(--ink-sub);
	}

	#university {
		height: 44px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.hint {
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-sub);
	}

	.start {
		margin-top: auto;
	}
</style>
