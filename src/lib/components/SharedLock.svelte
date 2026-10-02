<script lang="ts">
	// Shown where a feature needs an enrollment check: what it is, and the way to get it.
	let {
		access,
		what,
		from
	}: {
		access: 'need-verify' | 'unsupported' | 'no-university';
		// The feature, as the sentence's subject: 「授業の検索」
		what: string;
		// Where the feedback form for asking a university to be added comes back to
		from: string;
	} = $props();
</script>

<div class="lock">
	{#if access === 'no-university'}
		<b>{what}は、大学を選び、大学メールで在籍確認をすると使えます</b>
		<span>「その他」→「大学」から選べます。</span>
		<a class="btn btn-primary" href="/more/university">大学を選ぶ</a>
	{:else if access === 'unsupported'}
		<b>{what}は、在籍確認をすると使えます</b>
		<span>この大学は、まだ在籍確認に対応していません。対応してほしいときは、要望として送ってください。</span>
		<a class="btn" href="/feedback?from={encodeURIComponent(from)}">要望を送る</a>
	{:else}
		<b>{what}は、在籍確認をすると使えます</b>
		<span>大学のメールアドレスに届くリンクを開くと確認できます。</span>
		<a class="btn btn-primary" href="/more/verify">在籍確認する</a>
	{/if}
</div>

<style>
	.lock {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
	}

	b {
		font-size: 15px;
	}

	span {
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	a {
		margin-top: 4px;
		text-decoration: none;
		text-align: center;
	}
</style>
