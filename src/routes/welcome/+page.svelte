<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import IconFields from '$lib/components/IconFields.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { ICON_COLORS, iconOf, isIconText, splitGraphemes } from '$lib/icons';
	import { registerPasskey } from '$lib/passkey';

	let { data, form } = $props();
	let busy = $state(false);
	let passkeyError = $state<string | null>(null);

	// The icon starts as the nickname's first character; it follows the nickname until changed
	let nickname = $state('');
	let text = $state('');
	// svelte-ignore state_referenced_locally
	let color = $state<string>(ICON_COLORS.find((c) => c.hex === iconOf({ id: data.id, nickname: null, icon: null }).hex)?.id ?? ICON_COLORS[0].id);
	let fields = $state<IconFields>();
	let auto = '';
	$effect(() => {
		const next = splitGraphemes(nickname.trim())[0] ?? '';
		untrack(() => {
			if (text === auto) text = next;
		});
		auto = next;
	});
	const preview = $derived({ id: data.id, nickname: nickname.trim() || null, icon: { color, text: text.trim() } });

	async function onPasskey() {
		busy = true;
		passkeyError = null;
		try {
			const result = await registerPasskey();
			if (result.ok) await goto('/', { invalidateAll: true });
			else passkeyError = result.message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>ようこそ · コマあわせ</title>
</svelte:head>

<main>
	<h1>ようこそ</h1>

	{#if !data.nickname}
		<form
			method="POST"
			action="?/nickname"
			use:enhance={({ formData, cancel }) => {
				if (!fields?.prepare(formData)) cancel();
			}}
		>
			<label class="field">
				ニックネーム（友だちに表示されます）
				<input name="nickname" bind:value={nickname} maxlength="20" autocomplete="nickname" required />
			</label>
			<div class="preview">
				<UserIcon user={preview} size={72} />
				<span class="note">アイコンは友だちの一覧や、重ねた時間割に出ます。あとから変えられます。</span>
			</div>
			<div class="icon">
				<IconFields bind:this={fields} bind:text bind:color />
			</div>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit" disabled={!nickname.trim() || !isIconText(text.trim())}>決める</button>
		</form>
	{:else}
		<p>
			{data.nickname} さん、パスキーを作ると、次から顔認証や指紋認証だけでログインできます。
		</p>
		<button class="btn btn-primary" type="button" onclick={onPasskey} disabled={busy}>
			パスキーを作る
		</button>
		{#if passkeyError}<p class="error" role="alert">{passkeyError}</p>{/if}
		<a class="later" href="/">あとで</a>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: 64px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
	}

	p {
		margin: 0;
		line-height: 1.7;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.note {
		font-size: 12px;
		color: var(--ink-sub);
	}

	/* The icon fields keep their own side padding */
	.icon {
		margin: 0 -16px;
	}

	.later {
		align-self: center;
		padding: 12px;
		font-size: 14px;
	}
</style>
