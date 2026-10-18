<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/motion';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { registerPasskey } from '$lib/passkey';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	let busy = $state(false);
	let message = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	// After a passkey is removed: log out the other devices too?
	let askOthers = $state(false);

	async function add() {
		busy = true;
		message = null;
		const result = await registerPasskey();
		if (result.ok) await invalidateAll();
		else message = result.message;
		busy = false;
	}

	// 2026/9/28
	const day = (d: Date) => tokyoTime(d.getTime()).date.replace(/-0?/g, '/');
</script>

<svelte:head>
	<title>パスキー · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="パスキー" back="/more/account" />
	<div class="body">
		<p class="ui-note">
			パスキーがあると、スマホの顔認証や指紋認証だけでログインできます。すべて消しても、メールアドレスでログインできます。
		</p>

		{#if data.passkeys.length}
			<div class="ui-list">
				{#each data.passkeys as key (key.id)}
					<div transition:slide={motion()} class="key">
						{#if renaming === key.id}
							<form
								class="rename"
								method="POST"
								action="?/rename"
								use:enhance={() =>
									async ({ result, update }) => {
										await update();
										if (result.type === 'success') renaming = null;
									}}
							>
								<input type="hidden" name="id" value={key.id} />
								<input name="name" value={key.name ?? ''} maxlength="30" aria-label="パスキーの名前" required />
								<button class="small" type="submit">保存</button>
								<button class="small" type="button" onclick={() => (renaming = null)}>やめる</button>
							</form>
						{:else}
							<span class="icon"><Icon name="key" size={20} /></span>
							<span class="text">
								<span class="name">{key.name ?? 'パスキー'}</span>
								<span class="sub">
									{day(key.createdAt)}に作成{#if key.lastUsedAt} · {day(key.lastUsedAt)}に使用{/if}
								</span>
							</span>
							<button class="small" type="button" onclick={() => (renaming = key.id)}>名前</button>
							<form
								method="POST"
								action="?/remove"
								use:enhance={async ({ cancel }) => {
									if (!(await ask({ message: `「${key.name ?? 'パスキー'}」を消します。このパスキーではログインできなくなります`, ok: '消す', danger: true }))) return cancel();
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success' && Number(result.data?.others) > 0) askOthers = true;
									};
								}}
							>
								<input type="hidden" name="id" value={key.id} />
								<button class="remove" type="submit" aria-label="「{key.name ?? 'パスキー'}」を消す">
									<Icon name="trash" size={18} />
								</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">まだパスキーがありません。</p>
		{/if}
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

		<button class="btn btn-primary" type="button" onclick={add} disabled={busy}>
			<Icon name="plus" size={18} />このデバイスでパスキーを作る
		</button>
		{#if message}<p class="error" role="alert">{message}</p>{/if}
		{#if form?.ended}<p class="ui-note" role="status">ほかの端末をログアウトしました。</p>{/if}
	</div>
</div>

<Sheet bind:open={askOthers} title="ほかの端末もログアウトしますか？">
	<p class="ui-note">
		消したパスキーでログインしている端末があれば、ログアウトさせてください。どのパスキーでログインしたかは記録していないため、この端末のほかをすべてログアウトします。
	</p>
	<form
		class="ask"
		method="POST"
		action="?/endOthers"
		use:enhance={() => async ({ update }) => {
			await update();
			askOthers = false;
		}}
	>
		<button class="btn btn-primary" type="submit">ほかの端末をすべてログアウト</button>
		<button class="btn" type="button" onclick={() => (askOthers = false)}>しない</button>
	</form>
</Sheet>

<style>
	.ask {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.key {
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px 6px 12px;
	}

	.icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		background: var(--slot);
		color: var(--ink-soft);
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		font-size: 14px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.small {
		height: 34px;
		flex-shrink: 0;
		padding: 0 10px;
		border: 1px solid var(--line-bold);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.remove {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.rename {
		flex-grow: 1;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.rename input[name='name'] {
		min-width: 0;
		flex-grow: 1;
		height: 38px;
		box-sizing: border-box;
		padding: 0 10px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.empty {
		margin: 0;
		padding: 14px 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		font-size: 13px;
		color: var(--ink-sub);
	}
</style>
