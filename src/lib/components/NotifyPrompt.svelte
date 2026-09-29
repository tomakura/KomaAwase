<script lang="ts">
	import { page } from '$app/state';
	import { PROMPT_ROUTES, promptKind, type PromptKind } from '$lib/notify-prompt';
	import { enablePush, pushState } from '$lib/push-client';
	import Sheet from './Sheet.svelte';

	// Suggests turning notifications on: once per device, on a tab, a moment after opening.
	// A new person sees it at the first open after signing up, everyone else at their next one.
	let { signedIn, setupDone, publicKey, hold = false }: { signedIn: boolean; setupDone: boolean; publicKey: string | null; hold?: boolean } = $props();

	const KEY = 'koma:notify-prompt';
	// Where storage is blocked (a private window) it is asked each time, which beats never
	const asked = () => {
		try {
			return localStorage.getItem(KEY) !== null;
		} catch {
			return false;
		}
	};
	const remember = () => {
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			// Nothing to do
		}
	};

	let kind = $state<PromptKind | null>(null);
	let open = $state(false);
	let done = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let decided = false;

	const eligible = $derived(!hold && signedIn && setupDone && !!publicKey && PROMPT_ROUTES.includes(page.url.pathname));

	async function decide() {
		if (decided) return;
		decided = true;
		if (asked()) return;
		const state = await pushState(4000);
		let reminders: number | null = null;
		if (state === 'on') {
			try {
				const res = await fetch('/api/reminders');
				if (res.ok) reminders = ((await res.json()) as { count: number }).count;
			} catch {
				// Not known: nothing is shown
			}
		}
		const next = promptKind({ state, asked: asked(), reminders });
		// Gone from the tabs in the meantime: try again when back on one
		if (next && !PROMPT_ROUTES.includes(location.pathname)) {
			decided = false;
			return;
		}
		if (next) {
			kind = next;
			open = true;
		}
	}

	$effect(() => {
		if (!eligible) return;
		const timer = setTimeout(decide, 1500);
		return () => clearTimeout(timer);
	});

	// Closing by a button; a tap outside, Escape and a swipe down come through onclose
	function dismiss() {
		remember();
		open = false;
	}

	// The usual time before a class, for someone who chose none
	async function reminderOn() {
		const res = await fetch('/api/reminders', { method: 'POST' });
		return res.ok;
	}

	async function turnOn() {
		busy = true;
		message = null;
		if (kind === 'enable') {
			const result = await enablePush(publicKey!);
			if (!result.ok) {
				message =
					result.state === 'denied'
						? 'この端末では通知が許可されていません。端末の設定で許可してから、もう一度やり直してください'
						: (result.message ?? null);
				busy = false;
				return;
			}
		}
		if (await reminderOn()) done = true;
		else message = '設定できませんでした。「その他」→「通知」から設定してください';
		busy = false;
	}
</script>

<Sheet bind:open title={done ? '設定しました' : kind === 'install' ? '通知を使うには、ホーム画面に追加してください' : kind === 'reminder' ? '授業の前にも通知できます' : '通知をオンにしませんか'} onclose={remember}>
	{#if done}
		<p>授業が始まる10分前に、授業名・教室・開始時刻をお知らせします。時間は「その他」→「通知」で変えられます。</p>
		<button class="btn btn-primary" type="button" onclick={dismiss}>とじる</button>
	{:else if kind === 'install'}
		<p>iPhone・iPad は、ホーム画面に追加したアプリから通知を受け取れます。</p>
		<ol>
			<li>Safari の共有ボタン（□に↑のマーク）を押す</li>
			<li>「ホーム画面に追加」を選ぶ</li>
			<li>追加したアイコンから開いて、ログインする</li>
		</ol>
		<a class="btn btn-primary" href="/install" onclick={dismiss}>くわしい手順を見る</a>
		<button class="btn" type="button" onclick={dismiss}>あとで</button>
	{:else}
		<p>
			{#if kind === 'reminder'}
				授業が始まる前に、授業名・教室・開始時刻をお知らせします。まず10分前でオンにしますか。
			{:else}
				友だち申請の知らせと、授業が始まる10分前の知らせが届きます。
			{/if}
		</p>
		{#if message}<p class="error" role="alert">{message}</p>{/if}
		<button class="btn btn-primary" type="button" onclick={turnOn} disabled={busy}>
			{kind === 'reminder' ? '10分前に知らせる' : '通知をオンにする'}
		</button>
		<button class="btn" type="button" onclick={dismiss} disabled={busy}>あとで</button>
		<p class="note">時間は「その他」→「通知」でいつでも変えられます。</p>
	{/if}
</Sheet>

<style>
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}

	ol {
		margin: 0;
		padding-left: 1.4em;
		font-size: 14px;
		line-height: 1.8;
	}

	.note {
		font-size: 12px;
		color: var(--ink-sub);
	}

	a.btn {
		text-decoration: none;
	}
</style>
