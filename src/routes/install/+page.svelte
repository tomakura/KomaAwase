<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';

	// Which steps to show first; all of them stay on the page
	type Device = 'ios' | 'android' | 'desktop';
	let device = $state<Device>('desktop');
	let installed = $state(false);
	// Chrome and Edge can install from a button on the page
	let prompt = $state<(Event & { prompt(): Promise<void> }) | null>(null);

	$effect(() => {
		const ua = navigator.userAgent;
		device = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
		installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
		const keep = (e: Event) => {
			e.preventDefault();
			prompt = e as Event & { prompt(): Promise<void> };
		};
		addEventListener('beforeinstallprompt', keep);
		return () => removeEventListener('beforeinstallprompt', keep);
	});

	const order = $derived(
		device === 'ios' ? ['ios', 'android', 'desktop'] : device === 'android' ? ['android', 'ios', 'desktop'] : ['desktop', 'ios', 'android']
	);
</script>

<LegalPage title="ホーム画面に追加">
	{#if installed}
		<p class="done">ホーム画面に追加済みです。</p>
	{:else}
		<p>
			ホーム画面に追加すると、アプリのようにアイコンから開けます。iPhone・iPad で通知を受け取るには、ホーム画面への追加が必要です。
		</p>
		{#if prompt}
			<button
				class="btn btn-primary install"
				type="button"
				onclick={async () => {
					await prompt?.prompt();
					prompt = null;
				}}>コマあわせをインストール</button
			>
		{/if}
	{/if}

	{#each order as id (id)}
		{#if id === 'ios'}
			<h2>iPhone・iPad</h2>
			<ol>
				<li>Safari で koma.tomakura.com を開く</li>
				<li>共有ボタン（□に↑のマーク）を押す。見当たらなければ、画面下の「…」から「共有」</li>
				<li>「ホーム画面に追加」を選ぶ（一覧にないときは下にスクロール）</li>
				<li>「追加」を押す</li>
			</ol>
			<p class="small">Chrome など、ほかのブラウザでも共有ボタンから追加できます。</p>
		{:else if id === 'android'}
			<h2>Android</h2>
			<ol>
				<li>Chrome で koma.tomakura.com を開く</li>
				<li>右上の「︙」を押す</li>
				<li>「ホーム画面に追加」か「アプリをインストール」を選び、「インストール」を押す</li>
			</ol>
		{:else}
			<h2>パソコン（Chrome・Edge）</h2>
			<ol>
				<li>アドレスバーの右にあるインストールのマークを押す。なければ、右上のメニューから「コマあわせをインストール」（Edge は「アプリ」→「このサイトをアプリとしてインストール」）</li>
				<li>「インストール」を押す</li>
			</ol>
		{/if}
	{/each}

	<h2>追加したあと</h2>
	<p>
		追加したアイコンから開いて、ログインしてください（Safari とはログインが別になります）。通知は「その他」→「通知」からオンにできます。
	</p>
</LegalPage>

<style>
	.done {
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--slot);
	}

	.install {
		width: 100%;
		margin-top: 4px;
	}

	ol {
		margin: 0;
		padding-left: 1.4em;
	}

	li + li {
		margin-top: 4px;
	}

	.small {
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
