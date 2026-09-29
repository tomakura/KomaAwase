<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import OverlayDemo from '$lib/components/OverlayDemo.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import logo from '$lib/assets/favicon.svg';

	// Readable signed in or not: shared as a link, and reachable from the login page.
	const signedIn = $derived(page.data.signedIn);

	const features = [
		{
			icon: 'edit',
			title: '時間割を記録する',
			text: '同じ大学の人が登録した授業から選ぶだけ。授業名や先生を打つ手間がありません。ほかのアプリの時間割のスクショから、まとめて読み込むこともできます。'
		},
		{
			icon: 'overlap',
			title: '友だちと重ねる',
			text: '友だちやグループの時間割を1枚に重ねると、みんなが空いているコマがすぐわかります。大学が違う友だちとも、時刻で比べて重ねられます。'
		},
		{
			icon: 'users',
			title: 'サークル・ゼミの仲間と',
			text: '招待リンクを送るだけでグループに入れます。時間割を見せるかどうかは、入るときに自分で選べます。'
		},
		{
			icon: 'clock',
			title: '授業の前に通知',
			text: '授業が始まる10分前など、好きなタイミングで教室と一緒にお知らせします。休講の日は送りません。'
		},
		{
			icon: 'copy',
			title: '授業ごとにメモ・資料・課題',
			text: 'メモ、PDFや写真の資料、課題と締切、休講の予定を授業ごとにまとめておけます。'
		},
		{
			icon: 'image',
			title: '画像で保存・共有',
			text: '時間割を画像にして、ストーリーやLINEにそのまま送れます。'
		}
	] as const;

	const steps = ['メールアドレスかGoogleで登録', '大学と学期を選ぶ', '授業を入れて、友だちにリンクを送る'];
</script>

<svelte:head>
	<title>コマあわせとは · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="コマあわせとは" back={signedIn ? '/about' : '/login'} />

	<section class="hero">
		<img src={logo} alt="" width="72" height="72" />
		<h2>友だちと、時間割を共有しよう。</h2>
		<p>
			時間割を友だちや仲間と重ねて、みんなが空いているコマをすぐ見つけられるアプリです。「今度いつ集まれる？」を、話し合わずに決められます。
		</p>
		<div class="notes">
			<span>無料</span><span>広告なし</span><span>スマホ・パソコンで使える</span>
		</div>
	</section>

	<section class="demo" aria-label="時間割を重ねたイメージ">
		<OverlayDemo />
		<p class="caption">3人の時間割を重ねたところ。だれも授業のないコマが、「みんな空いてるコマ」に出ます。</p>
	</section>

	<section class="block">
		<h2>できること</h2>
		<div class="features">
			{#each features as f (f.title)}
				<div class="feature">
					<span class="mark"><Icon name={f.icon} size={22} /></span>
					<div>
						<h3>{f.title}</h3>
						<p>{f.text}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2>見せる相手は、自分で決める</h2>
		<ul class="plain">
			<li>時間割が見えるのは、承認した友だちと、参加するときに見せると選んだグループだけです。</li>
			<li>友だちからは、授業と教室が見えます。メモ・資料・課題は見えません。</li>
			<li>ブロックすると、同じグループにいても時間割は見えなくなります。</li>
			<li>ログインは、パスキー（指紋や顔）が使えます。パスワードは作りません。</li>
		</ul>
	</section>

	<section class="block">
		<h2>はじめ方</h2>
		<ol class="steps">
			{#each steps as s (s)}<li>{s}</li>{/each}
		</ol>
		<p class="small">ホーム画面に追加すると、アプリのように使えます。<a href="/install">追加のしかた</a></p>
	</section>

	<section class="cta">
		{#if signedIn}
			<a class="btn btn-primary" href="/">時間割を開く</a>
		{:else}
			<a class="btn btn-primary" href="/login">はじめる</a>
		{/if}
		<p class="small">個人で開発して、無料で運営しています。</p>
		<p class="small links"><a href="/terms">利用規約</a><a href="/privacy">プライバシーポリシー</a><a href="/about">このアプリについて</a></p>
	</section>
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 20px 24px 8px;
		text-align: center;
	}

	.hero h2 {
		margin: 4px 0 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 22px;
		line-height: 1.4;
		text-wrap: balance;
	}

	.hero p {
		margin: 0;
		font-size: 14px;
		line-height: 1.85;
		color: var(--ink-soft);
	}

	.notes {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
	}

	.notes span {
		padding: 3px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.demo {
		margin: 20px 20px 4px;
	}

	.caption {
		margin: 8px 0 0;
		font-size: 12px;
		line-height: 1.7;
		color: var(--ink-sub);
		text-align: center;
	}

	.block {
		padding: 8px 20px 0;
	}

	.block h2 {
		margin: 24px 0 10px;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 700;
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.feature {
		display: flex;
		gap: 12px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.mark {
		flex: none;
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 11px;
		background: var(--slot);
		color: var(--accent-text);
	}

	.feature h3 {
		margin: 0 0 3px;
		font-size: 15px;
		font-weight: 700;
	}

	.feature p {
		margin: 0;
		font-size: 13px;
		line-height: 1.8;
		color: var(--ink-soft);
	}

	.plain,
	.steps {
		margin: 0;
		padding-left: 1.4em;
		font-size: 14px;
		line-height: 1.85;
	}

	.plain li + li,
	.steps li + li {
		margin-top: 4px;
	}

	.small {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.7;
		color: var(--ink-sub);
	}

	.small a {
		color: inherit;
	}

	.cta {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		padding: 28px 20px 0;
		text-align: center;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 14px;
	}
</style>
