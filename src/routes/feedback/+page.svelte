<script lang="ts">
	import { enhance } from '$app/forms';
	import { version } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Switch from '$lib/components/Switch.svelte';

	let { data, form } = $props();

	const KINDS = [
		{ id: 'bug', label: '不具合' },
		{ id: 'request', label: '要望' },
		{ id: 'other', label: 'そのほか' }
	] as const;
	let kind = $state<'bug' | 'request' | 'other'>('bug');
	let attach = $state(false);

	// Shown in full before sending; nothing else is attached.
	let info = $state<Record<string, string>>({});
	$effect(() => {
		info = {
			version,
			userAgent: navigator.userAgent,
			screen: `${screen.width}×${screen.height}（表示 ${innerWidth}×${innerHeight}）`,
			page: data.from,
			theme: document.documentElement.dataset.theme ?? ''
		};
	});
	const LABELS: Record<string, string> = {
		version: 'アプリのバージョン',
		userAgent: 'ブラウザ',
		screen: '画面の大きさ',
		page: '開いていた画面',
		theme: 'テーマ'
	};
</script>

<svelte:head>
	<title>不具合・要望を送る · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="不具合・要望を送る" back={data.from || '/more'} />

	{#if form?.sent}
		<div class="body">
			<p class="thanks" role="status">送信しました。ありがとうございます。</p>
			<a class="btn" href={data.from || '/more'}>もどる</a>
		</div>
	{:else}
		<form class="body" method="POST" use:enhance>
			<Segmented options={KINDS} bind:value={kind} label="種類" name="kind" />
			<label class="field">
				{kind === 'bug' ? '何をしたら、どうなりましたか' : kind === 'request' ? 'ほしい機能や、変えてほしいところ' : '内容'}
				<textarea name="body" rows="7" maxlength="2000" required></textarea>
			</label>
			<p class="ui-note">返信や、くわしいお話を聞くために、運営から連絡することがあります。そのため、登録しているメールアドレスも運営に送られます。個人情報は書かないでください。</p>

			<div class="ui-list">
				<div class="ui-row">
					<span id="attach-label">端末の情報を付ける</span>
					<Switch bind:checked={attach} labelledby="attach-label" name="attach" />
				</div>
				{#if attach}
					<dl class="info">
						{#each Object.entries(info) as [key, value] (key)}
							{#if value}
								<div>
									<dt>{LABELS[key]}</dt>
									<dd>{value}</dd>
								</div>
								<input type="hidden" name={key} {value} />
							{/if}
						{/each}
					</dl>
				{/if}
			</div>
			<p class="ui-note">原因を探すのに役立ちます。送られるのは上に表示されている内容だけです。</p>

			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit">送る</button>
		</form>
	{/if}
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	textarea {
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		line-height: 1.6;
		resize: vertical;
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 12px 14px;
	}

	.info div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	dt {
		font-size: 11px;
		color: var(--ink-sub);
	}

	dd {
		margin: 0;
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.thanks {
		margin: 0;
		padding: 14px;
		border-radius: 12px;
		background: var(--course-green);
		font-size: 14px;
		line-height: 1.7;
	}
</style>
