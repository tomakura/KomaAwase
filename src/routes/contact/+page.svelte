<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SendButton from '$lib/components/SendButton.svelte';
	import { motion } from '$lib/motion';
	import { pauseAfterSent } from '$lib/send';

	let { data, form } = $props();
	let phase = $state<'idle' | 'sending' | 'done'>('idle');

	type Turnstile = {
		render: (el: HTMLElement, options: Record<string, unknown>) => string;
		reset: (id: string) => void;
		remove: (id: string) => void;
	};
	const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

	// The check against scripts, drawn once the page is open (explicit rendering keeps it from
	// drawing into a form that's gone after sending)
	let widget = $state<HTMLDivElement>();
	let widgetId: string | undefined;
	$effect(() => {
		const el = widget;
		const sitekey = data.siteKey;
		if (!el || !sitekey) return;
		const render = () => {
			widgetId = turnstile()?.render(el, { sitekey, language: 'ja', theme: 'auto' });
		};
		let script: HTMLScriptElement | undefined;
		if (turnstile()) render();
		else {
			script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			script.addEventListener('load', render);
			document.head.appendChild(script);
		}
		return () => {
			script?.removeEventListener('load', render);
			if (widgetId) turnstile()?.remove(widgetId);
			widgetId = undefined;
		};
	});
</script>

<svelte:head>
	<title>お問い合わせ · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="お問い合わせ" back={data.signedIn ? '/more' : '/login'} />

	{#if form?.sent}
		<div class="body">
			<!-- Comes up from below -->
			<p class="thanks" role="status" in:fly|global={{ y: 28, ...motion(420) }}>送信しました。返信は、入力したメールアドレスにお送りします。</p>
			<a class="btn" href={data.signedIn ? '/more' : '/login'} in:fly|global={{ y: 28, delay: 70, ...motion(420) }}>もどる</a>
		</div>
	{:else}
		<form
			class="body"
			method="POST"
			use:enhance={() => {
				phase = 'sending';
				return async ({ result, update }) => {
					// The wheel turns into a check, then what was sent comes up
					if (result.type === 'success') {
						phase = 'done';
						await pauseAfterSent();
					}
					await update({ reset: false });
					phase = 'idle';
					// A token works once: a failed send needs a fresh one
					if (result.type !== 'success' && widgetId) turnstile()?.reset(widgetId);
				};
			}}
		>
			{#if data.signedIn}
				<p class="ui-note">アプリの不具合や要望は、<a href="/feedback?from=/contact">不具合・要望を送る</a>からも送れます。</p>
			{/if}
			<label class="field">
				名前
				<input name="name" value={form?.name ?? data.name} maxlength="50" autocomplete="name" required />
			</label>
			<label class="field">
				メールアドレス
				<input name="email" type="email" value={form?.email ?? data.email} autocomplete="email" required />
			</label>
			<label class="field">
				内容
				<textarea name="body" rows="8" maxlength="2000" required>{form?.body ?? ''}</textarea>
			</label>
			<!-- Left empty by people; scripts fill in every field -->
			<div class="trap" aria-hidden="true">
				<label>ウェブサイト<input name="website" tabindex="-1" autocomplete="off" /></label>
			</div>
			{#if data.siteKey}<div class="turnstile" bind:this={widget}></div>{/if}
			<p class="ui-note">返信は、入力したメールアドレスにお送りします。</p>

			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<SendButton {phase} class="btn btn-primary">送る</SendButton>
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

	.body a:not(.btn) {
		color: var(--accent-text);
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

	.trap {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}

	.turnstile {
		min-height: 65px;
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
