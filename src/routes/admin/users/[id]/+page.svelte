<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import WarningScreen from '$lib/components/WarningScreen.svelte';
	import { WARNING_MAX } from '$lib/moderation';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	const u = $derived(data.user);
	const day = (d: Date | null) => (d ? tokyoTime(d.getTime()).date.replace(/-/g, '/') : 'まだ');
	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};

	let body = $state('');
	let previewing = $state(false);
	const confirmed = (message: string, ok: string) => async (input: { cancel: () => void }) => {
		if (!(await ask({ message, ok, danger: true }))) input.cancel();
	};
</script>

<svelte:head>
	<title>{u.nickname ?? '利用者'} · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title={u.nickname ?? '（ニックネームなし）'} back="/admin/users" />

	<section class="ui-section">
		<div class="ui-list">
			<div class="ui-row"><span>メールアドレス</span><span class="ui-row-value">{u.email}</span></div>
			<div class="ui-row"><span>大学</span><span class="ui-row-value">{u.university ?? 'なし'}</span></div>
			<div class="ui-row"><span>在籍確認</span><span class="ui-row-value">{u.verified ? '確認済み' : 'まだ'}</span></div>
			<div class="ui-row"><span>登録日</span><span class="ui-row-value">{day(u.createdAt)}</span></div>
			<div class="ui-row"><span>最後に使った日</span><span class="ui-row-value">{day(u.lastSeenAt)}</span></div>
			<div class="ui-row"><span>受けた通報</span><span class="ui-row-value">{u.reported}件</span></div>
			<div class="ui-row"><span>状態</span><span class="ui-row-value">{u.suspendedAt ? `利用停止（${day(u.suspendedAt)}から）` : 'ふつう'}</span></div>
		</div>
		<p class="ui-note">時間割の中身は、ここからは見えません。</p>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">警告を送る</h2>
		<form
			class="warn"
			method="POST"
			action="?/warn"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						body = '';
						previewing = false;
					}
				}}
		>
			<textarea name="body" bind:value={body} rows="5" maxlength={WARNING_MAX} placeholder="警告の文（{WARNING_MAX}文字まで）" required></textarea>
			{#if previewing && body.trim()}
				<p class="ui-note">利用者にはこのように出ます。</p>
				<WarningScreen id="preview" body={body.trim()} preview />
			{/if}
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			{#if form?.warned}<p class="ui-note" role="status">送りました。</p>{/if}
			<div class="actions">
				<button class="btn" type="button" disabled={!body.trim()} onclick={() => (previewing = !previewing)}>
					{previewing ? '下書きを閉じる' : '下書きを見る'}
				</button>
				<button class="btn btn-primary" type="submit" disabled={!body.trim()}>送る</button>
			</div>
		</form>
	</section>

	{#if u.warnings.length}
		<section class="ui-section">
			<h2 class="ui-section-title">送った警告（{u.warnings.length}）</h2>
			{#each u.warnings as w (w.id)}
				<div class="item">
					<p class="text">{w.body}</p>
					<p class="dates">
						送った日 {when(w.createdAt)} ·
						{#if w.acknowledgedAt}押した日 {when(w.acknowledgedAt)}{:else}まだ押されていません{/if}
					</p>
				</div>
			{/each}
		</section>
	{/if}

	<section class="ui-section">
		<h2 class="ui-section-title">対応</h2>
		<div class="tools">
			{#if u.suspendedAt}
				<form method="POST" action="?/resume" use:enhance>
					<button class="btn" type="submit">利用を再開する</button>
				</form>
			{:else}
				<form method="POST" action="?/suspend" use:enhance={confirmed('この人の利用を止めます。すべての端末からログアウトされ、ログインできなくなります', '止める')}>
					<button class="btn" type="submit">利用を止める</button>
				</form>
			{/if}
			<form method="POST" action="?/nickname" use:enhance={confirmed('ニックネームを消します。次に開いたとき、新しく決めてもらいます', '消す')}>
				<button class="btn" type="submit" disabled={!u.nickname}>ニックネームを戻す</button>
			</form>
			<form method="POST" action="?/photo" use:enhance={confirmed('写真を消します', '消す')}>
				<button class="btn" type="submit" disabled={!u.hasPhoto}>写真を消す</button>
			</form>
			<form method="POST" action="?/remove" use:enhance={confirmed('この人を退会させます。時間割などのデータがすべて消え、元に戻せません', '退会させる')}>
				<button class="btn danger" type="submit">退会させる</button>
			</form>
		</div>
	</section>
</div>

<style>
	.warn {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	textarea {
		box-sizing: border-box;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		line-height: 1.6;
		resize: vertical;
	}

	.actions,
	.tools {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.tools {
		grid-template-columns: 1fr;
	}

	.tools form {
		display: contents;
	}

	.btn {
		min-height: 48px;
	}

	.danger {
		color: var(--accent-text);
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.text {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.dates {
		margin: 0;
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
