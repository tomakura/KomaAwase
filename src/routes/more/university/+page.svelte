<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(data.universityName);
	const normalized = $derived(name.normalize('NFKC').replace(/\s+/g, ' ').trim());
	const hasPreset = $derived(normalized !== data.universityName && data.presetNames.includes(normalized));
	let usePreset = $state(true);
</script>

<svelte:head>
	<title>大学 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="大学" back="/more" />
	<form method="POST" use:enhance>
		<label class="field">
			大学
			<input name="university" list="universities" bind:value={name} maxlength="40" autocomplete="organization" placeholder="〇〇大学" />
		</label>
		<datalist id="universities">
			{#each data.universities as u (u)}<option value={u}></option>{/each}
		</datalist>

		{#if hasPreset}
			<label class="check">
				<input type="checkbox" name="usePreset" bind:checked={usePreset} />
				学期と時限の時刻を{normalized}のものに入れ替える
			</label>
		{/if}

		<p class="ui-note">
			「授業をさがす」には、同じ大学の人が登録した授業が出ます。大学を変えても、みんなと同期している授業はそのまま残ります。
		</p>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit">保存する</button>
	</form>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 14px;
	}

	.check input {
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--ink);
	}
</style>
