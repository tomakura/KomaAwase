<script lang="ts">
	import { page } from '$app/state';
	import { PROMPT_ROUTES } from '$lib/notify-prompt';
	import { verifyHref, type VerifyPrompt } from '$lib/verify-prompt';
	import Sheet from './Sheet.svelte';
	import VerifyBenefits from './VerifyBenefits.svelte';

	// Suggests confirming enrollment: for someone who never has, and as the check runs out
	// (30, 14 and 7 days before, and once after). What was shown is kept on the account, so
	// each comes once, on a tab, a moment after opening.
	// `dismissed` is the stage the person has closed, so the layout can stop holding back the
	// screen that follows (NotifyPrompt) while the page's data still carries this one.
	let {
		prompt,
		setupDone,
		dismissed = $bindable(-1)
	}: { prompt: VerifyPrompt | null; setupDone: boolean; dismissed?: number } = $props();

	let open = $state(false);
	// The prompt on screen; kept because the page's data still holds it until it next loads
	let shown = $state<VerifyPrompt | null>(null);
	let seen = -1;

	const eligible = $derived(setupDone && !!prompt && PROMPT_ROUTES.includes(page.url.pathname));

	$effect(() => {
		if (!eligible || !prompt || prompt.stage === seen) return;
		const next = prompt;
		const timer = setTimeout(() => {
			if (!PROMPT_ROUTES.includes(location.pathname)) return;
			seen = next.stage;
			shown = next;
			open = true;
			fetch('/api/verify-prompt', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ stage: next.stage })
			}).catch(() => {});
		}, 1500);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!open && shown) dismissed = shown.stage;
	});

	const title = $derived(
		shown?.kind === 'expiring'
			? `在籍確認の期限まで、あと${shown.days}日`
			: shown?.kind === 'lapsed'
				? '在籍確認の期限が切れました'
				: '在籍確認をしませんか'
	);
</script>

<Sheet bind:open {title}>
	{#if shown?.kind === 'expiring' || shown?.kind === 'lapsed'}
		<p>
			在籍確認は、毎年5月1日に切れます。切れると、みんなの授業データとスクショの読み込みが使えなくなります。
			大学のメールアドレスに届くリンクを開くと、確認し直せます。
		</p>
		<a class="btn btn-primary" href={verifyHref(page.url)} onclick={() => (open = false)}>確認し直す</a>
	{:else}
		<p>大学のメールアドレスに届くリンクを開くと確認できます。確認すると、次のことができます。</p>
		<VerifyBenefits />
		<a class="btn btn-primary" href={verifyHref(page.url)} onclick={() => (open = false)}>在籍確認する</a>
	{/if}
	<button class="btn" type="button" onclick={() => (open = false)}>あとで</button>
</Sheet>

<style>
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}

	a.btn {
		text-decoration: none;
		text-align: center;
	}
</style>
