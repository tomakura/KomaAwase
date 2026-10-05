<script lang="ts">
	import { enhance } from '$app/forms';
	import { draft } from '$lib/draft';
	import { version } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { tokyoTime } from '$lib/time';

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
	const STATUS = { open: '受付', doing: '対応中', closed: '対応済み', declined: '見送り' } as const;
	const day = (d: Date) => tokyoTime(d.getTime()).date.replace(/-/g, '/');
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
		<form class="body" method="POST" use:enhance use:draft={'feedback'}>
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

	{#if data.sent.length}
		<section class="body sent" id="sent">
			<h2>送ったもの</h2>
			{#each data.sent as f (f.id)}
				<div class="item">
					<div class="meta">
						<span class="status" class:done={f.status === 'closed'} class:doing={f.status === 'doing'}>{STATUS[f.status]}</span>
						<span class="date">{day(f.createdAt)}</span>
					</div>
					<p class="sent-body">{f.body}</p>
					{#if f.reply}
						<div class="reply">
							<span class="reply-from">運営から{#if f.repliedAt}（{day(f.repliedAt)}）{/if}</span>
							<p>{f.reply}</p>
						</div>
					{/if}
				</div>
			{/each}
		</section>
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

	.sent {
		padding-top: 28px;
	}

	.sent h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status {
		padding: 1px 8px;
		border-radius: 5px;
		background: var(--slot);
		font-size: 11px;
		font-weight: 700;
	}

	.status.doing {
		background: var(--course-yellow);
	}

	.status.done {
		background: var(--course-green);
	}

	.date {
		margin-left: auto;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.sent-body,
	.reply p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.reply {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--slot);
	}

	.reply-from {
		font-size: 11px;
		color: var(--ink-sub);
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
