<script lang="ts">
	import { isIos, isStandalone, subscription } from '$lib/push-client';
	import { tokyoTime } from '$lib/time';

	// 届かないときは: goes through what a notification needs on this device, in order, and
	// says where it stops and what to do there. Nothing secret (the endpoint, the keys) is shown.
	type Check = { label: string; ok: boolean | null; detail: string };

	let checks = $state<Check[] | null>(null);
	let running = $state(false);

	const when = (ms: number) => {
		const t = tokyoTime(ms);
		const m = Math.floor(t.minutes);
		return `${Number(t.date.slice(5, 7))}月${Number(t.date.slice(8))}日 ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};

	async function run() {
		running = true;
		const out: Check[] = [];
		try {
			const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
			if (isIos()) {
				const home = isStandalone();
				out.push({
					label: 'ホーム画面から開いている',
					ok: home,
					detail: home ? 'ホーム画面に追加したアプリで開いています。' : 'iPhone・iPad では、ホーム画面に追加したコマあわせから開いてください。'
				});
			}
			if (!supported) {
				out.push({ label: '通知が使えるブラウザ', ok: false, detail: 'このブラウザでは通知を受け取れません。' });
				return;
			}
			const permission = Notification.permission;
			out.push({
				label: '通知の許可',
				ok: permission === 'granted',
				detail:
					permission === 'granted'
						? '許可されています。'
						: permission === 'denied'
							? '端末かブラウザの設定で、コマあわせの通知を許可してください。'
							: '上の「この端末で通知を受け取る」を押してください。'
			});
			if (permission !== 'granted') return;

			const sub = await subscription(3000).catch(() => null);
			let state: { registered: boolean; lastOkAt: number | null; lastFailedAt: number | null } | null = null;
			if (sub) {
				const res = await fetch('/api/push/check', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint })
				}).catch(() => null);
				state = res?.ok ? await res.json() : null;
			}
			const registered = !!sub && !!state?.registered;
			out.push({
				label: 'この端末の登録',
				ok: sub && !state ? null : registered,
				detail: registered
					? '通知の届け先として登録されています。'
					: sub && !state
						? '確かめられませんでした。通信できるところで、もう一度試してください。'
						: '「この端末ではやめる」を押してから、もう一度「この端末で通知を受け取る」を押してください。'
			});
			if (!registered || !state) return;

			const { lastOkAt, lastFailedAt } = state;
			const failedLast = lastFailedAt !== null && (lastOkAt === null || lastFailedAt > lastOkAt);
			out.push({
				label: '最後に送った結果',
				ok: lastOkAt === null && lastFailedAt === null ? null : !failedLast,
				detail: failedLast
					? `${when(lastFailedAt)} に送れませんでした。テストの通知を送って、届くか確かめてください。`
					: lastOkAt !== null
						? `${when(lastOkAt)} に届けました。届いていなければ、端末の「おやすみモード」や通知の設定を確かめてください。`
						: 'まだ送っていません。テストの通知を送ってみてください。'
			});
		} finally {
			checks = out;
			running = false;
		}
	}
</script>

<section>
	<h2>届かないときは</h2>
	<button class="btn" type="button" onclick={run} disabled={running}>{running ? '確かめています…' : checks ? 'もう一度確かめる' : '確かめる'}</button>
	{#if checks}
		<ol class="ui-list">
			{#each checks as c (c.label)}
				<li class="ui-row check">
					<span class="mark" class:ok={c.ok === true} class:ng={c.ok === false} aria-label={c.ok === true ? 'OK' : c.ok === false ? '要確認' : '不明'}
						>{c.ok === true ? '✓' : c.ok === false ? '!' : '?'}</span
					>
					<span class="text"><b>{c.label}</b>{c.detail}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
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

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.check {
		align-items: flex-start;
		justify-content: flex-start;
		gap: 12px;
		padding: 10px 14px;
	}

	.mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--slot);
		font-size: 12px;
		font-weight: 700;
	}

	.mark.ok {
		background: var(--ink);
		color: var(--bg);
	}

	.mark.ng {
		background: var(--accent-text);
		color: var(--surface);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
		line-height: 1.6;
		text-align: left;
	}

	.text b {
		font-size: 14px;
	}
</style>
