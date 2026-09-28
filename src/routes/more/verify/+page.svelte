<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();
	let sending = $state(false);
	const day = (ms: number) => tokyoTime(ms).date.replace(/-0?/g, '/');
</script>

<svelte:head>
	<title>在籍確認 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="在籍確認" back="/more" />
	<div class="body">
		{#if data.verification?.current}
			<div class="status">
				<Icon name="badge" size={26} />
				<div>
					<b>{data.verification.university}の在籍を確認済み</b>
					<span>{data.verification.email} · {day(data.verification.expiresAt)}まで</span>
				</div>
			</div>
			<p class="ui-note">毎年4月に、もう一度確認してください。卒業したあともメールが使える大学があるためです。</p>
		{:else}
			<p class="lead">
				大学のメールアドレスに確認リンクを送ります。確認すると、友だちやグループのメンバーに「在籍確認済み」と表示されます（任意）。
			</p>
		{/if}

		{#if !data.university}
			<p class="ui-note">先に<a href="/more/university">大学</a>を選んでください。</p>
		{:else if !data.university.domains.length}
			<p class="ui-note">
				{data.university.name}はまだ在籍確認に対応していません。対応してほしいときは、大学のメールアドレスの@から後ろを添えて
				<a href="/feedback?from=/more/verify">要望</a>を送ってください。
			</p>
		{:else if form?.sentTo}
			<p class="sent" role="status">{form.sentTo} に確認のメールを送りました。1日以内にリンクを開いてください。</p>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					sending = true;
					return async ({ update }) => {
						await update();
						sending = false;
					};
				}}
			>
				<label class="field">
					{data.university.name}のメールアドレス
					<input
						name="email"
						type="email"
						autocomplete="off"
						placeholder={`…@${data.university.domains[0]}`}
						required
					/>
				</label>
				{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
				<button class="btn btn-primary" type="submit" disabled={sending}>
					{sending ? '送っています…' : data.verification?.current ? '確認し直す' : '確認のメールを送る'}
				</button>
			</form>
			<p class="ui-note">このアドレスはほかの人には見えません。1つのアドレスで確認できるのは1人だけです。</p>
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		border-radius: 14px;
		background: var(--course-green);
	}

	.status div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.status b {
		font-size: 14px;
	}

	.status span {
		font-size: 12px;
		color: var(--ink-soft);
		overflow-wrap: anywhere;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sent {
		margin: 0;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
</style>
