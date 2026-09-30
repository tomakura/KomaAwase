<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import AuthScreen from '$lib/components/AuthScreen.svelte';

	let { data, form } = $props();
	let busy = $state(false);
	const view = $derived(form?.state ?? data.state);
</script>

<svelte:head>
	<title>在籍確認 · コマあわせ</title>
</svelte:head>

<AuthScreen title="在籍確認">
	{#if form?.university !== undefined}
		<p role="status">{form.university}の在籍を確認できました。友だちや同じグループの人に「在籍確認済み」の印が見えます。</p>
		<a class="btn btn-primary" href="/more/verify">コマあわせを開く</a>
	{:else if form?.message || view === 'expired'}
		<p class="error" role="alert">{form?.message ?? 'リンクの期限が切れているか、すでに使われています'}</p>
		<a class="btn" href="/more/verify">もう一度申し込む</a>
	{:else if view === 'other-account'}
		<p role="alert">このリンクは、別のアカウントで申し込まれたものです。申し込んだアカウントでログインしてから、もう一度開いてください。</p>
		<form method="POST" action="/logout">
			<input type="hidden" name="next" value={page.url.pathname} />
			<button class="btn btn-primary" type="submit">ログアウトする</button>
		</form>
	{:else if view === 'taken'}
		<p role="alert">このアドレスは、ほかのアカウントの在籍確認に使われています。</p>
		<p class="note">そのアカウントを使うか、退会してから確認してください。心当たりがないときは、<a href="/contact">運営に連絡</a>してください。</p>
		<a class="btn" href="/more/verify">もどる</a>
	{:else if data.state === 'ready'}
		<p><b>{data.nickname}</b> さんのアカウントで、{data.university}の在籍確認をします。</p>
		<p class="address">確認するアドレス：{data.email}</p>
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
			<button class="btn btn-primary" type="submit" disabled={busy}>確認する</button>
		</form>
	{/if}
</AuthScreen>

<style>
	.address,
	.note {
		font-size: 14px;
		color: var(--ink-soft);
	}
</style>
