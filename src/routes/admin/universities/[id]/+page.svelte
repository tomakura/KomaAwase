<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data, form } = $props();

	const u = $derived(data.university);
	const confirmed = (message: string, ok: string) => async (input: { cancel: () => void }) => {
		if (!(await ask({ message, ok, danger: true }))) input.cancel();
	};
</script>

<svelte:head>
	<title>{u.name} · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title={u.name} back="/admin/universities" />

	<section class="ui-section">
		<h2 class="ui-section-title">名前を直す</h2>
		<form method="POST" action="?/rename" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<input name="name" value={u.name} maxlength={data.nameMax} required aria-label="大学の名前" />
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			{#if form?.renamed}<p class="ui-note" role="status">直しました。</p>{/if}
			<button class="btn btn-primary" type="submit">保存する</button>
		</form>
		<p class="ui-note">使っている{u.users}人の表示も変わります。</p>
		<p class="ui-note">
			入力した人：{#if u.createdBy}<a href="/admin/users/{u.createdBy}">{u.creator ?? '（名前なし）'}</a>{:else}不明{/if}
		</p>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">消す</h2>
		<p class="ui-note">
			{u.users}人が使っています。消すと、その人の大学は「未設定」に戻ります。時間割と授業は残ります。この大学の「みんなの登録」は消え、同期していた授業はその人だけの授業になります。
		</p>
		<form
			method="POST"
			action="?/remove"
			use:enhance={confirmed(`「${u.name}」を消します。${u.users}人の大学が未設定に戻り、元に戻せません`, '消す')}
		>
			<button class="btn danger" type="submit">この大学を消す</button>
		</form>
	</section>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.danger {
		color: var(--accent-text);
	}
</style>
