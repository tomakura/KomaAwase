<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { registerPasskey } from '$lib/passkey';

	let { data, form } = $props();
	let busy = $state(false);
	let passkeyError = $state<string | null>(null);

	async function onPasskey() {
		busy = true;
		passkeyError = null;
		try {
			const result = await registerPasskey();
			if (result.ok) await goto('/', { invalidateAll: true });
			else passkeyError = result.message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>ようこそ · コマあわせ</title>
</svelte:head>

<main>
	<h1>ようこそ</h1>

	{#if !data.nickname}
		<form method="POST" action="?/nickname" use:enhance>
			<label class="field">
				ニックネーム（友だちに表示されます）
				<input name="nickname" maxlength="20" autocomplete="nickname" required />
			</label>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit">決める</button>
		</form>
	{:else}
		<p>
			{data.nickname} さん、パスキーを作ると、次から顔認証や指紋認証だけでログインできます。
		</p>
		<button class="btn btn-primary" type="button" onclick={onPasskey} disabled={busy}>
			パスキーを作る
		</button>
		{#if passkeyError}<p class="error" role="alert">{passkeyError}</p>{/if}
		<a class="later" href="/">あとで</a>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: 64px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
	}

	p {
		margin: 0;
		line-height: 1.7;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.later {
		align-self: center;
		padding: 12px;
		font-size: 14px;
	}
</style>
