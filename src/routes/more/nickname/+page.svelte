<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { NICKNAME_MAX } from '$lib/icons';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>ニックネーム · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="ニックネーム" back="/more" />
	<form method="POST" use:enhance>
		<label class="field">
			ニックネーム（友だちに表示されます）
			<input name="nickname" value={data.nickname} maxlength={NICKNAME_MAX} autocomplete="nickname" required />
		</label>
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
</style>
