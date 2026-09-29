<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { REMINDERS_MAX, REMINDER_MINUTES, leadLabel } from '$lib/reminder';

	let { data, form } = $props();

	// What this device can do, found out in the browser
	type State = 'checking' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';
	let device = $state<State>('checking');
	let busy = $state(false);
	let message = $state<string | null>(null);

	// iPhone and iPad only deliver notifications to the app added to the home screen
	const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

	async function subscription() {
		const registration = await navigator.serviceWorker.ready;
		return registration.pushManager.getSubscription();
	}

	async function check() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
			device = isIos() && !standalone() ? 'install' : 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			device = 'denied';
			return;
		}
		device = (await subscription()) ? 'on' : 'off';
	}

	$effect(() => {
		check();
	});

	function keyBytes(key: string) {
		const s = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4));
		return Uint8Array.from(s, (c) => c.charCodeAt(0));
	}

	async function turnOn() {
		if (!data.publicKey) return;
		busy = true;
		message = null;
		try {
			if ((await Notification.requestPermission()) !== 'granted') {
				device = Notification.permission === 'denied' ? 'denied' : 'off';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const sub =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) }));
			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(sub.toJSON())
			});
			if (!res.ok) {
				message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'この端末では通知を受け取れませんでした';
				await sub.unsubscribe();
				return;
			}
			device = 'on';
			await invalidateAll();
		} catch {
			message = 'この端末では通知を受け取れませんでした';
		} finally {
			busy = false;
		}
	}

	async function turnOff() {
		busy = true;
		message = null;
		try {
			const sub = await subscription();
			if (sub) {
				await fetch('/api/push/unsubscribe', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint })
				});
				await sub.unsubscribe();
			}
			device = 'off';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	let settingsForm = $state<HTMLFormElement>();

	// svelte-ignore state_referenced_locally
	let picked = $state<number[]>(data.reminders);
	let remindersForm = $state<HTMLFormElement>();
</script>

<svelte:head>
	<title>通知 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="通知" back="/more" />

	<div class="body">
		{#if !data.available}
			<p class="ui-note">通知は準備中です。</p>
		{:else}
			<section class="device">
				<h2>この端末</h2>
				{#if device === 'checking'}
					<p class="ui-note">確かめています…</p>
				{:else if device === 'install'}
					<p>iPhone・iPad では、ホーム画面に追加したコマあわせから通知を受け取れます。</p>
					<a class="btn" href="/install">ホーム画面に追加する方法</a>
				{:else if device === 'unsupported'}
					<p>このブラウザでは通知を受け取れません。ホーム画面に追加したアプリからお試しください。</p>
					<a class="btn" href="/install">ホーム画面に追加する方法</a>
				{:else if device === 'denied'}
					<p>このサイトの通知がオフになっています。端末の設定で通知を許可してから、もう一度開いてください。</p>
				{:else if device === 'on'}
					<p>この端末で通知を受け取っています。</p>
					<div class="row">
						<form method="POST" action="?/test" use:enhance>
							<button class="btn" type="submit">テストの通知を送る</button>
						</form>
						<button class="btn" type="button" onclick={turnOff} disabled={busy}>この端末ではやめる</button>
					</div>
					{#if form?.tested}<p class="ui-note" role="status">送信しました。</p>{/if}
				{:else}
					<p>友だち申請やスクショの読み取り完了などをお知らせします。</p>
					<button class="btn btn-primary" type="button" onclick={turnOn} disabled={busy}>この端末で通知を受け取る</button>
				{/if}
				{#if message || form?.message}<p class="error" role="alert">{message ?? form?.message}</p>{/if}
				{#if data.devices}<p class="ui-note">通知を受け取っている端末：{data.devices}台</p>{/if}
			</section>

			<section>
				<h2>知らせること</h2>
				<form
					class="ui-list"
					method="POST"
					action="?/settings"
					bind:this={settingsForm}
					use:enhance={() => async ({ update }) => update({ reset: false })}
				>
					{#each data.kinds as kind (kind.id)}
						<div class="ui-row">
							<span id="kind-{kind.id}">{kind.label}</span>
							<Switch
								checked={kind.on}
								name={kind.id}
								labelledby="kind-{kind.id}"
								onchange={() => queueMicrotask(() => settingsForm?.requestSubmit())}
							/>
						</div>
					{/each}
				</form>
				<p class="ui-note">設定はすべての端末で共通です。</p>
			</section>

			<section>
				<h2>授業の前の通知</h2>
				<form method="POST" action="?/reminders" bind:this={remindersForm} use:enhance={() => async ({ update }) => update({ reset: false })}>
					<div class="chips">
						{#each REMINDER_MINUTES as m (m)}
							<label class="chip">
								<input
									type="checkbox"
									name="minutes"
									value={m}
									bind:group={picked}
									disabled={!picked.includes(m) && picked.length >= REMINDERS_MAX}
									onchange={() => queueMicrotask(() => remindersForm?.requestSubmit())}
								/>
								<span>{leadLabel(m)}</span>
							</label>
						{/each}
					</div>
				</form>
				<p class="ui-note">授業が始まる前に、授業名・教室・開始時刻をお知らせします。{REMINDERS_MAX}つまで選べます。</p>
				{#if device !== 'on' && device !== 'checking'}
					<p class="ui-note">通知をオンにした端末に届きます。</p>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 6px 16px 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.row > * {
		flex: 1 1 140px;
	}

	.row form .btn {
		width: 100%;
	}

	.chips {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}

	.chip {
		position: relative;
	}

	.chip input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.chip span {
		display: block;
		padding: 11px 2px;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-size: 13px;
		font-weight: 700;
		text-align: center;
	}

	.chip:has(input:checked) span {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.chip:has(input:disabled) {
		opacity: 0.4;
	}

	.chip:has(input:disabled) input {
		cursor: default;
	}

	.chip:has(input:focus-visible) span {
		outline: 2px solid var(--accent-text);
		outline-offset: 2px;
	}
</style>
