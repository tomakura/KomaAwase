<script lang="ts">
	import { invalidate } from '$app/navigation';
	import Cropper from '$lib/components/Cropper.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SharedLock from '$lib/components/SharedLock.svelte';
	import { IMPORT_CONSENT_VERSION } from '$lib/import-consent';
	import { nextRetryTime } from '$lib/import-quota';
	import { monthDay, tokyoTime } from '$lib/time';

	let { data } = $props();

	let fileInput = $state<HTMLInputElement>();
	let src = $state<string | null>(null);
	let cropper = $state<Cropper>();
	let agreed = $state(false);
	let sending = $state(false);
	let message = $state<string | null>(null);

	function pick(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		if (src) URL.revokeObjectURL(src);
		src = URL.createObjectURL(file);
		message = null;
	}

	async function start() {
		if (!cropper) return;
		sending = true;
		message = null;
		try {
			const cropped = await cropper.crop();
			if (!cropped) {
				message = '画像を読み込めませんでした。別の画像でやり直してください';
				return;
			}
			const res = await fetch('/import/upload', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...cropped, term: data.term, agreed, consent: IMPORT_CONSENT_VERSION })
			});
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			if (!res.ok) {
				message = body?.message ?? '送れませんでした。時間をおいてもう一度やり直してください';
				return;
			}
			if (src) URL.revokeObjectURL(src);
			src = null;
			agreed = false;
			// So picking the same file again still opens it
			if (fileInput) fileInput.value = '';
			await invalidate('app:import');
		} catch {
			message = '送れませんでした。電波のよいところで、もう一度やり直してください';
		} finally {
			sending = false;
		}
	}

	// While the screenshot waits or is read, check every few seconds.
	$effect(() => {
		const status = data.job?.status;
		if (status !== 'queued' && status !== 'processing') return;
		const timer = setInterval(() => invalidate('app:import'), 4000);
		return () => clearInterval(timer);
	});

	// 「明日の朝」: when a screenshot that could not be read today is read (a few days on if those mornings are taken too)
	const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));
	const deferredDays = (at: number | null) => daysBetween(tokyoTime(Date.now()).date, tokyoTime(at ?? nextRetryTime().getTime()).date);
	function whenLabel(at: number | null) {
		const days = deferredDays(at);
		return `${days <= 0 ? '今日' : days === 1 ? '明日' : `${days}日後`}の朝`;
	}

	const minutes = $derived(Math.max(1, Math.ceil(((data.job?.ahead ?? 0) + 1) * 0.5)));

	// How long ago it was sent, ticking while it waits or is read
	let now = $state(Date.now());
	$effect(() => {
		const status = data.job?.status;
		if (status !== 'queued' && status !== 'processing') return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const elapsed = $derived.by(() => {
		const seconds = Math.max(0, Math.round((now - (data.job?.createdAt ?? now)) / 1000));
		return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60 ? `${seconds % 60}秒` : ''}`;
	});
</script>

<svelte:head>
	<title>スクショから読み込む · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="スクショから読み込む" back={data.back} />

	<div class="body">
		{#if data.job}
			{@const job = data.job}
			<div class="status" class:ready={job.status === 'done'} role="status">
				<Icon name={job.status === 'done' ? 'check' : 'clock'} size={22} />
				<div class="status-text">
					{#if job.status === 'queued' && job.ahead}
						<b>順番待ち中（前にあと{job.ahead}件）</b>
						<span>あと{minutes}分ほどで始まります。</span>
					{:else if job.status === 'queued'}
						<b>まもなく読み取りを始めます</b>
						<span>少しお待ちください。</span>
					{:else if job.status === 'processing'}
						<b>AIが読み取っています</b>
						<span>30秒〜1分ほどで終わります。</span>
					{:else if job.status === 'retry' && job.deferred}
						<b>{whenLabel(job.retryAt)}に読み取ります</b>
						<span>
							{deferredDays(job.retryAt) <= 1
								? '今日の読み取りは、アプリ全体の上限に達しました。'
								: '混み合っているため、'}{whenLabel(job.retryAt)}（10時ごろ）に読み取って、終わったらお知らせします。{deferredDays(job.retryAt) <= 1 ? 'この画面は閉じても大丈夫です。' : ''}
						</span>
					{:else if job.status === 'retry'}
						<b>あとでもう一度読み取ります</b>
						<span>
							今日は読み取れなかったため、{whenLabel(job.retryAt)}（10時ごろ）にもう一度読み取ります。終わったらお知らせします。
						</span>
					{:else if job.status === 'done'}
						<b>読み取りが終わりました</b>
						<span>保存する前に、内容を見直してください。</span>
					{:else}
						<b>読み取れませんでした</b>
						<span>画像を切り抜き直すか、授業を自分で入力してください。</span>
					{/if}
				</div>
			</div>
			{#if job.status === 'queued' || job.status === 'processing'}
				<ol class="steps" aria-label="読み取りの進み具合">
					<li class="done">受け取り</li>
					<li class:done={job.status === 'processing'} class:now={job.status === 'queued'}>
						{job.ahead ? '順番待ち' : '準備'}
					</li>
					<li class:now={job.status === 'processing'}>読み取り</li>
					<li>確認して保存</li>
				</ol>
				<p class="ui-note">
					送信から{elapsed}。この画面は閉じても大丈夫です。終わったらお知らせします。
				</p>
			{/if}
			{#if job.status === 'done' || job.status === 'failed'}
				<a class="btn btn-primary" href="/import/{job.id}">{job.status === 'done' ? '読み取った授業を見る' : 'くわしく見る'}</a>
			{/if}
		{/if}

		{#if data.access !== 'ok' && !data.job}
			<p class="lead">ほかのアプリの時間割を、スクリーンショットから読み込めます。</p>
			<SharedLock access={data.access} what="スクショからの読み込み" from="/import" />
			<p class="ui-note">授業は <a href="/courses/new">自分で入力</a> することもできます。</p>
		{:else if !data.job || data.job.status === 'failed'}
			<p class="lead">ほかのアプリの時間割を、スクリーンショットから読み込めます。</p>

			<input class="file" type="file" accept="image/*" bind:this={fileInput} onchange={(e) => pick(e.currentTarget.files)} />
			{#if src}
				<Cropper {src} bind:this={cropper} />
				<div class="crop-actions">
					<button class="small" type="button" onclick={() => cropper?.reset()}>切り抜きを戻す</button>
					<button class="small" type="button" onclick={() => fileInput?.click()}>別の画像にする</button>
				</div>
				<p class="ui-note">時間割の部分だけを囲むと、読み取りの精度が上がります。</p>
			{:else}
				<button class="pick" type="button" onclick={() => fileInput?.click()}>
					<Icon name="image" size={32} />
					<span class="pick-title">画像をえらぶ</span>
					<span class="pick-sub">時間割の部分だけに切り抜けます</span>
				</button>
			{/if}

			{#if data.readAt}
				<p class="crowded" role="status">
					今日の読み取りは、アプリ全体の上限に達しました。いま送ると、{whenLabel(data.readAt)}に読み取って結果をお知らせします。
				</p>
			{/if}

			<div class="notes">
				<h2>読み込む前に</h2>
				<div class="item">
					<span class="num">1</span>
					<span>読み取りはAIが行います。読み取り結果には誤りが含まれることがあります。保存する前に、授業名・曜日・時限・教室を確認してください。</span>
				</div>
				<div class="item">
					<span class="num">2</span>
					<span>
						画像は米国の Groq と Cloudflare に送られ、AIが読み取ります。米国には日本のような全国共通の個人情報保護法がありません。両社は画像を学習に使いません。コマあわせに届いた画像は、読み取ったらすぐに消します（読み取れなかったときも、4日以内に消します）。<a
							href="/privacy#foreign">くわしく見る</a
						>
					</span>
				</div>
				<div class="item">
					<span class="num">3</span>
					<span>読み取りは1分ほどで終わります。混んでいるときは順番待ちになります。終わったらお知らせします。</span>
				</div>
				<div class="item">
					<span class="num">4</span>
					<span>この機能には、アプリ全体で1日の利用上限があります。混み合っているときは、結果が届くまで時間がかかることがあります。</span>
				</div>
			</div>

			<label class="agree">
				<input type="checkbox" bind:checked={agreed} />
				上のことを確認し、画像を米国の Groq と Cloudflare に送ることに同意します
			</label>

			{#if message}<p class="error" role="alert">{message}</p>{/if}
			<button class="btn btn-primary" type="button" disabled={!src || !agreed || sending} onclick={start}>
				{sending ? '送っています…' : '同意して読み込む'}
			</button>
			<p class="ui-note">
				1日{data.dailyLimit}回まで読み込めます。見つからない授業は <a href="/courses/new">自分で入力</a> するか、<a href="/import/csv">CSV から入力</a> できます。個人情報の扱いは、<a href="/privacy">プライバシーポリシー</a>をご覧ください。
			</p>
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.file {
		display: none;
	}

	.crowded {
		margin: 0;
		padding: 12px 14px;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		font-size: 13px;
		line-height: 1.7;
		color: var(--accent-text);
	}

	.pick {
		height: 168px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 2px dashed var(--line-bold);
		border-radius: 16px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		cursor: pointer;
	}

	.pick-title {
		font-size: 15px;
		font-weight: 700;
	}

	.pick-sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.crop-actions {
		display: flex;
		justify-content: center;
		gap: 8px;
	}

	.small {
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.notes {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.notes h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}


	.item {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 13px;
		line-height: 1.7;
	}

	.num {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 11px;
		background: var(--course-orange);
		color: var(--now-text);
		font-size: 12px;
		font-weight: 700;
	}

	.agree {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.agree input {
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--ink);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--slot);
		color: var(--ink-soft);
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 4px 4px 0;
		list-style: none;
		font-size: 13px;
		color: var(--ink-soft);
	}

	.steps li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* A dot per step: filled when done, ringed and pulsing while it's the current one */
	.steps li::before {
		content: '';
		width: 10px;
		height: 10px;
		flex-shrink: 0;
		border: 2px solid var(--line);
		border-radius: 50%;
	}

	.steps li.done::before {
		border-color: var(--ink-soft);
		background: var(--ink-soft);
	}

	.steps li.now {
		color: var(--ink);
		font-weight: 700;
	}

	.steps li.now::before {
		border-color: var(--accent-text);
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-text) 25%, transparent);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.steps li.now::before {
			animation: none;
		}
	}

	.status.ready {
		background: var(--course-green);
	}

	.status-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		line-height: 1.6;
	}

	.status-text b {
		font-size: 13px;
		color: var(--ink);
	}
</style>
