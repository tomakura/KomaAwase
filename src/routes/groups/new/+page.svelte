<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { form } = $props();
</script>

<svelte:head>
	<title>グループを作る · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="グループを作る" back="/friends" />
	<form method="POST" use:enhance>
		<label class="field">
			グループの名前
			<input name="name" maxlength="30" placeholder="写真部、〇〇ゼミ など" autocomplete="off" required />
		</label>
		<p class="ui-note">
			作ったら招待リンクをメンバーに送ります。参加した人は、このグループに時間割を見せるかを自分で選べます。
		</p>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit">作る</button>
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
