<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodsEditor from '$lib/components/PeriodsEditor.svelte';
	import { periodsProblem } from '$lib/presets';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let periods = $state(data.periods);
	let saving = $state(false);
</script>

<svelte:head>
	<title>時限と時刻 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="時限と時刻" back="/more" />
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
		<p class="ui-note">時間割の左に出る時刻です。今の授業の表示や、友だちと重ねるときにも使います。</p>
		<PeriodsEditor bind:periods usedNumbers={data.usedPeriods} name="periods" collapsible={false} />
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit" disabled={saving || !!periodsProblem(periods)}>
			{saving ? '保存中…' : '保存する'}
		</button>
	</form>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}
</style>
