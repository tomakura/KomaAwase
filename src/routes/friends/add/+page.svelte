<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import QrCode from '$lib/components/QrCode.svelte';
	import { copyText, shareLink } from '$lib/share';

	let { data, form } = $props();

	let status = $state<string | null>(null);
	let showQr = $state(false);

	async function share() {
		const result = await shareLink(data.link, 'コマあわせで友だちになろう');
		status = result === 'copied' ? 'リンクをコピーしました' : result === 'failed' ? 'リンクをコピーできませんでした' : null;
	}

	async function copy() {
		status = (await copyText(data.link)) === 'copied' ? 'リンクをコピーしました' : 'リンクをコピーできませんでした';
	}
</script>

<svelte:head>
	<title>友だちを追加 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="友だちを追加" back="/friends" />

	<section class="ui-section">
		<h2 class="ui-section-title">あなたの友だちリンク</h2>
		<div class="card">
			<p class="lead">このリンクを開いた人が、あなたに友だち申請できます。承認するまで時間割は見えません。</p>
			<div class="link">
				<span class="url">{data.link.replace(/^https?:\/\//, '')}</span>
			</div>
			<div class="buttons">
				<button class="btn btn-primary" type="button" onclick={share}><Icon name="share" size={18} />共有する</button>
				<button class="btn" type="button" onclick={copy}><Icon name="copy" size={18} />リンクをコピー</button>
				<button class="btn" type="button" aria-expanded={showQr} onclick={() => (showQr = !showQr)}>
					<Icon name="qr" size={18} />QR
				</button>
			</div>
			{#if status}<p class="status" role="status">{status}</p>{/if}
			{#if showQr}
				<div class="qr">
					<QrCode text={data.link} size={200} label="友だちリンクのQRコード" />
					<span class="ui-note">友だちのスマホのカメラで読み取ってもらいます。</span>
				</div>
			{/if}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">友だちのコードで追加</h2>
		<form class="find" method="POST" action="?/find" use:enhance>
			<input
				name="code"
				aria-label="友だちのコードかリンク"
				placeholder="コード（10文字）かリンク"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				required
			/>
			<button class="btn" type="submit">さがす</button>
		</form>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<p class="ui-note">あなたのコードは <b class="code">{data.code}</b> です。</p>
	</section>

	<section class="ui-section">
		<form
			method="POST"
			action="?/regenerate"
			use:enhance={async ({ cancel }) => {
				if (!(await ask({ message: '今のリンクとコードは使えなくなります。作り直しますか？', ok: '作り直す' }))) return cancel();
			}}
		>
			<button class="regenerate" type="submit">リンクとコードを作り直す</button>
		</form>
		<p class="ui-note">知らない人にリンクが広まったときに使います。友だちはそのまま残ります。</p>
		{#if form?.regenerated}<p class="status" role="status">新しいリンクにしました</p>{/if}
	</section>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.lead {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.link {
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--slot);
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1.4fr 1fr 0.8fr;
		gap: 8px;
	}

	.buttons .btn {
		min-height: 46px;
		padding: 0 8px;
		font-size: 14px;
	}

	.status {
		margin: 0;
		font-size: 13px;
		color: var(--ink-soft);
	}

	.qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding-top: 4px;
	}

	.find {
		display: flex;
		gap: 8px;
	}

	.find input {
		flex-grow: 1;
		min-width: 0;
		height: 48px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		letter-spacing: 0.04em;
	}

	.find .btn {
		min-height: 48px;
	}

	.code {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.08em;
		color: var(--ink);
	}

	.regenerate {
		align-self: flex-start;
		padding: 10px 0;
		border: none;
		background: none;
		color: var(--accent-text);
		font-family: inherit;
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
