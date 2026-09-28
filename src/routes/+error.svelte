<script lang="ts">
	import { page } from '$app/state';

	const notFound = $derived(page.status === 404);
	const title = $derived(
		notFound ? 'ページが見つかりません' : page.status === 429 ? '少し待ってください' : 'うまくいきませんでした'
	);
	// Our own messages are written for people; anything else gets a plain explanation.
	const message = $derived(
		page.error?.message && /[ぁ-んァ-ン一-龥]/.test(page.error.message)
			? page.error.message
			: notFound
				? 'リンクがまちがっているか、消されたページかもしれません。'
				: '時間をおいて、もう一度お試しください。'
	);
</script>

<svelte:head>
	<title>{title} · コマあわせ</title>
</svelte:head>

<main>
	<svg width="56" height="56" viewBox="0 0 48 48" aria-hidden="true">
		<rect x="4" y="8" width="26" height="26" rx="7" fill="var(--shu)" />
		<rect x="18" y="14" width="26" height="26" rx="7" fill="var(--ai)" class="overlap" />
	</svg>
	<h1>{title}</h1>
	<p>{message}</p>
	<a class="btn btn-primary" href="/">時間割へ</a>
	{#if !notFound}
		<a class="report" href="/feedback?from={encodeURIComponent(page.url.pathname)}">この不具合を知らせる</a>
	{/if}
	<span class="code">{page.status}</span>
</main>

<style>
	main {
		max-width: 420px;
		min-height: 100svh;
		box-sizing: border-box;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
		padding: 32px 24px;
	}

	.overlap {
		mix-blend-mode: var(--logo-blend);
	}

	h1 {
		margin: 8px 0 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
	}

	p {
		margin: 0;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.report {
		align-self: center;
		padding: 10px;
		font-size: 14px;
	}

	.code {
		align-self: center;
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
