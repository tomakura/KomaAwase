<script lang="ts">
	import { enhance } from '$app/forms';
	import MailSent from '$lib/components/MailSent.svelte';
	import VerifyBenefits from '$lib/components/VerifyBenefits.svelte';

	let { data, form } = $props();
	let sending = $state(false);
	// 「別のアドレスにする」 after the mail was sent
	let other = $state(false);
	$effect(() => {
		if (form?.sentTo) other = false;
	});
</script>

<svelte:head>
	<title>在籍確認 · コマあわせ</title>
</svelte:head>

<main>
	<header>
		<h1>在籍確認をしませんか</h1>
		<p>{data.university.name}のメールアドレスにリンクを送って、開くだけです。確認すると、次のことができます。</p>
	</header>

	<VerifyBenefits />

	{#if form?.sentTo && !other}
		{#key form}
			<MailSent email={form.sentTo} action="?/send" onother={() => (other = true)}>
				{form.sentTo} に確認のメールを送りました。1日以内にリンクを開いてください。届かないときは、迷惑メールのフォルダも見てください。
			</MailSent>
		{/key}
		<form method="POST" action="?/skip" use:enhance>
			<button class="btn btn-primary" type="submit">はじめる</button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/send"
			use:enhance={() => {
				sending = true;
				return async ({ update }) => {
					await update({ reset: false });
					sending = false;
				};
			}}
		>
			<label class="field">
				{data.university.name}のメールアドレス
				<input name="email" type="email" autocomplete="off" placeholder={`…@${data.university.domains[0]}`} value={form?.email ?? ''} required />
			</label>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit" disabled={sending}>{sending ? '送っています…' : '確認のメールを送る'}</button>
			<p class="note">このアドレスはほかの人には見えません。あとから「その他」→「在籍確認」でもできます。</p>
		</form>
		<form method="POST" action="?/skip" use:enhance>
			<button class="later" type="submit">あとで</button>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 480px;
		min-height: var(--page-h);
		box-sizing: border-box;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 32px 20px 28px;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
	}

	header p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-sub);
	}


	.later {
		align-self: center;
		padding: 12px;
		border: none;
		background: none;
		color: var(--ink-soft);
		font: inherit;
		font-size: 14px;
	}
</style>
