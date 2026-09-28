<script lang="ts">
	import { version } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';

	let { data } = $props();
</script>

<LegalPage title="このアプリについて">
	<div class="brand">
		<svg width="64" height="64" viewBox="0 0 48 48" aria-hidden="true">
			<rect x="4" y="8" width="26" height="26" rx="7" fill="var(--shu)" />
			<rect x="18" y="14" width="26" height="26" rx="7" fill="var(--ai)" class="overlap" />
		</svg>
		<span class="name">コマあわせ</span>
		<span class="copy">友だちと、時間割を共有しよう。</span>
	</div>

	<p>
		大学の時間割を記録して、友だちやサークル・ゼミの仲間と重ねると、みんなが空いているコマがすぐわかります。同じ大学の人が登録した授業から選べるので、入力もかんたんです。
	</p>
	<p>個人で開発して、無料で運営しています。広告は出しません。</p>

	<div class="ui-list links">
		{#if data.supportUrl}
			<a class="ui-row" href={data.supportUrl} target="_blank" rel="noopener">
				<span>開発を応援する</span><span class="ui-row-value"><Icon name="external" size={16} /></span>
			</a>
		{/if}
		<a class="ui-row" href="/feedback?from=/about"><span>不具合・要望を送る</span><span class="ui-row-value"><Icon name="chevron" size={16} /></span></a>
		<a class="ui-row" href="/terms"><span>利用規約</span><span class="ui-row-value"><Icon name="chevron" size={16} /></span></a>
		<a class="ui-row" href="/privacy"><span>プライバシーポリシー</span><span class="ui-row-value"><Icon name="chevron" size={16} /></span></a>
		<a class="ui-row" href="https://github.com/tomakura/KomaAwase" target="_blank" rel="noopener">
			<span>ソースコード（GitHub）</span><span class="ui-row-value"><Icon name="external" size={16} /></span>
		</a>
	</div>

	<h2>使っているもの</h2>
	<p class="small">
		文字は Zen Maru Gothic と Zen Kaku Gothic New（SIL Open Font License）。SvelteKit、Drizzle ORM、SimpleWebAuthn、uqr などのオープンソースのソフトウェアと、Cloudflare の上で動いています。
	</p>
	<p class="small">バージョン {version}</p>
</LegalPage>

<style>
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 12px 0 20px;
	}

	.overlap {
		mix-blend-mode: var(--logo-blend);
	}

	.name {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 26px;
	}

	.copy {
		font-size: 13px;
		color: var(--ink-sub);
	}

	.links {
		margin: 16px 0 8px;
		line-height: 1.4;
	}

	.small {
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
