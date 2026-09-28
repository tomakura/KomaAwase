<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TermsEditor from '$lib/components/TermsEditor.svelte';
	import { termsProblem } from '$lib/terms';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let terms = $state(data.terms);
	let saving = $state(false);
</script>

<svelte:head>
	<title>学期の区切り · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="学期の区切り" back="/more" />
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
		<p class="ui-note">
			時間割の上のタブになります。日付を入れておくと、開いたときに今の学期が出ます。「まとまり」はタブの上に出る名前（前期・後期など）です。
		</p>
		<TermsEditor bind:terms year={data.year} preset={data.preset} name="terms" collapsible={false} />
		<p class="ui-note">区切りを変えると、消した学期の授業は、その時期にあたる学期に移ります。</p>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit" disabled={saving || !!termsProblem(terms)}>
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
