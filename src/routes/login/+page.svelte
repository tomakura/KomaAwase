<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { loginWithPasskey } from '$lib/passkey';
	import logo from '$lib/assets/favicon.svg';
	import { clearPageCaches } from '$lib/offline';

	let { data, form } = $props();
	let busy = $state(false);
	let sending = $state(false);
	let passkeyError = $state<string | null>(null);
	let blocked = $state(false);

	// Signed out: the pages kept for offline use hold the last person's timetable. Signing in
	// waits for them to go, so the next person never sees one.
	let cleared: Promise<void> = Promise.resolve();
	$effect(() => {
		cleared = clearPageCaches().catch(() => {});
	});

	async function onPasskey() {
		busy = true;
		passkeyError = null;
		try {
			const result = await loginWithPasskey();
			if (result.ok) {
				await cleared;
				await goto(data.next ?? '/', { invalidateAll: true });
			}
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
		{#if data.bye}<p class="sent" role="status">退会しました。ご利用ありがとうございました。</p>{/if}
		<button class="btn btn-primary" type="button" onclick={onPasskey} disabled={busy}>
			パスキーでログイン
		</button>
		{#if passkeyError}<p class="error" role="alert">{passkeyError}</p>{/if}

		<div class="divider"><span>はじめての人・パスキーがない人</span></div>

		{#if data.google}
			<!-- Google's branding rules: the colored G on a white (or, in dark mode, #131314) button -->
			<a class="google" href="/login/google">
				<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
					<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
					<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
					<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
					<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
				</svg>
				Googleで続ける
			</a>
			{#if data.googleFailed}<p class="error" role="alert">Googleでログインできませんでした。もう一度お試しください</p>{/if}
			{#if data.googleUseMail}
				<p class="error" role="alert">このGoogleアカウントのメールアドレスでは続けられません。下からメールアドレスでログインしてください</p>
			{/if}
		{/if}

		{#if form?.sentTo}
			<p class="sent" role="status">
				{form.sentTo} にログイン用のリンクを送りました。15分以内に開いてください。
			</p>
		{:else}
			<form
				method="POST"
				action="?/email"
				use:enhance={() => {
					sending = true;
					blocked = false;
					return async ({ result, update }) => {
						// Cloudflare's rate limit answers with its own page, which isn't a form result;
						// the form stays and says to wait instead of the whole screen being replaced.
						if (result.type === 'error') blocked = true;
						else await update();
						sending = false;
					};
				}}
			>
				<label class="field">
					メールアドレス
					<input name="email" type="email" autocomplete="email" required />
				</label>
				{#if blocked}
					<p class="error" role="alert">送れませんでした。しばらく待ってから、もう一度お試しください</p>
				{:else if form?.message}
					<p class="error" role="alert">{form.message}</p>
				{/if}
				<button class="btn" type="submit" disabled={sending}>
					{sending ? '送信中…' : 'メールでログイン・登録'}
				</button>
			</form>
		{/if}
		<p class="legal">
			登録すると、<a href="/terms">利用規約</a>と<a href="/privacy">プライバシーポリシー</a>に同意したことになります。
		</p>
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

	.google {
		min-height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 1px solid #747775;
		border-radius: 14px;
		background: #ffffff;
		color: #1f1f1f;
		font-size: 15px;
		font-weight: 700;
		text-decoration: none;
	}

	/* The dark theme Google allows */
	:global(:root[data-theme='dark']) .google {
		border-color: #8e918f;
		background: #131314;
		color: #e3e3e3;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .google {
			border-color: #8e918f;
			background: #131314;
			color: #e3e3e3;
		}
	}

	.legal {
		margin: 4px 0 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-sub);
		text-align: center;
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
