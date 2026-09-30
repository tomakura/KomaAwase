<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthScreen from '$lib/components/AuthScreen.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>ログイン · コマあわせ</title>
</svelte:head>

<AuthScreen>
	{#if form?.message || !data.email}
		<p class="error" role="alert">{form?.message ?? 'リンクの期限が切れているか、すでに使われています'}</p>
		<a class="btn" href="/login">ログイン画面にもどる</a>
	{:else}
		<p><b>{data.email}</b> でログインします。</p>
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<button class="btn btn-primary" type="submit" disabled={busy}>ログインする</button>
		</form>
	{/if}
</AuthScreen>
