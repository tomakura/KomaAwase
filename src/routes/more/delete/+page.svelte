<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data, form } = $props();
	let deleting = $state(false);
	let formEl = $state<HTMLFormElement>();
</script>

<svelte:head>
	<title>退会する · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="退会する" back="/more" />
	<form
		class="body"
		method="POST"
		bind:this={formEl}
		use:enhance={async ({ cancel }) => {
			if (!deleting && !(await ask({ message: '本当に退会しますか？ 元に戻せません', ok: '退会する', danger: true }))) {
				cancel();
				return;
			}
			deleting = true;
			return async ({ result, update }) => {
				if (result.type === 'success' && result.data?.more) {
					// Files are removed some at a time; carry on until they are all gone.
					formEl?.requestSubmit();
					return;
				}
				await update();
				deleting = false;
			};
		}}
	>
		<p class="lead">{data.email} のアカウントを削除します。元に戻せません。</p>

		<section>
			<h2>消えるもの</h2>
			<ul>
				<li>アカウント、パスキー、在籍確認</li>
				<li>時間割（過去の年度も）、授業、メモ・課題・休講、資料のファイル</li>
				<li>友だち、ブロック、グループへの参加。作ったグループは、ほかのメンバーに引き継がれます</li>
				<li>スクリーンショットの読み込みの記録</li>
			</ul>
		</section>
		<section>
			<h2>残るもの</h2>
			<ul>
				<li>「みんなと同期する」で登録した授業のデータ。ほかの人も使っているので、だれが登録したかを消して残します</li>
				<li>送った不具合・要望と通報。送った人の情報は消します</li>
			</ul>
		</section>

		<label class="agree">
			<!-- Required rather than a disabled button, so the form works before (or without) JavaScript -->
			<input type="checkbox" name="confirm" required checked={form?.more} />
			消える情報と、退会後も残る情報を確認しました。
		</label>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<!-- With JavaScript the page carries on by itself; without, one press per round -->
		{#if form?.more}<p class="more" role="status">資料のファイルを少しずつ消しています。もう一度「アカウントを完全に削除」を押して続けてください。</p>{/if}
		<button class="btn danger" type="submit" disabled={deleting}>{deleting ? '削除しています…' : 'アカウントを完全に削除'}</button>
	</form>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.more {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}

	section {
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	h2 {
		margin: 0 0 6px;
		font-size: 13px;
		font-weight: 700;
	}

	ul {
		margin: 0;
		padding-left: 1.3em;
		font-size: 13px;
		line-height: 1.7;
	}

	.agree {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.agree input {
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--ink);
	}

	.danger {
		border-color: var(--accent-text);
		background: var(--accent-text);
		color: var(--surface);
	}
</style>
