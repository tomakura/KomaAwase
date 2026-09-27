<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { loginWithPasskey } from '$lib/passkey';
	import logo from '$lib/assets/favicon.svg';

	let { form } = $props();
	let busy = $state(false);
	let passkeyError = $state<string | null>(null);

	async function onPasskey() {
		busy = true;
		passkeyError = null;
		try {
			const result = await loginWithPasskey();
			if (result.ok) await goto('/', { invalidateAll: true });
			else passkeyError = result.message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>ログイン · コマあわせ</title>
</svelte:head>

<main>
	<div class="brand">
		<img src={logo} alt="" width="88" height="88" />
		<h1>コマあわせ</h1>
		<p>友だちと、時間割を共有しよう。</p>
	</div>

	<div class="actions">
		<button class="btn btn-primary" type="button" onclick={onPasskey} disabled={busy}>
			パスキーでログイン
		</button>
		{#if passkeyError}<p class="error" role="alert">{passkeyError}</p>{/if}

		<div class="divider"><span>はじめての人・パスキーがない人</span></div>

		{#if form?.sentTo}
			<p class="sent" role="status">
				{form.sentTo} にログイン用のリンクを送りました。15分以内に開いてください。
			</p>
		{:else}
			<form method="POST" action="?/email" use:enhance>
				<label class="field">
					メールアドレス
					<input name="email" type="email" autocomplete="email" required />
				</label>
				{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
				<button class="btn" type="submit">メールでログイン・登録</button>
			</form>
		{/if}
	</div>
</main>

<style>
	main {
		min-height: 100svh;
		box-sizing: border-box;
		max-width: 420px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: 0 24px 32px;
	}

	.brand {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 34px;
		letter-spacing: 0.03em;
	}

	.brand p {
		margin: 0;
		color: var(--ink-sub);
	}

	.actions,
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.divider::before,
	.divider::after {
		content: '';
		flex-grow: 1;
		height: 1px;
		background: var(--line);
	}

	.sent {
		margin: 0;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
		line-height: 1.7;
	}
</style>
