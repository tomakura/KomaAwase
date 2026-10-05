<script lang="ts">
	import { enhance } from '$app/forms';
	import ImportReview from '$lib/components/ImportReview.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>読み取った授業 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="読み取った授業" back="/import" />

	{#if data.job.status !== 'done' || data.job.closed}
		<div class="body">
			<p class="lead">
				{data.job.closed
					? 'この読み込みは終わっています。'
					: '画像から授業を読み取れませんでした。時間割の部分だけを切り抜くと、読み取れることがあります。'}
			</p>
			<a class="btn btn-primary" href="/import">もう一度読み込む</a>
			<a class="btn" href="/courses/new">自分で入力する</a>
			{#if !data.job.closed}
				<form method="POST" action="?/dismiss" use:enhance><button class="link" type="submit">この読み込みを閉じる</button></form>
			{/if}
		</div>
	{:else}
		<ImportReview
			terms={data.terms}
			periods={data.periods}
			existing={data.existing}
			defaultTerm={data.defaultTerm}
			canShare={data.canShare}
			groups={data.groups}
			action="?/save"
			message={form?.message}
			lead="AIが読み取った内容です。授業名・曜日・時限・教室がまちがっていないか、保存する前に見直してください。"
		/>
		<form class="dismiss" method="POST" action="?/dismiss" use:enhance>
			<button class="link" type="submit">追加しないで閉じる</button>
		</form>
	{/if}
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

	.dismiss {
		display: flex;
		justify-content: center;
		padding: 8px 16px 0;
	}

	.link {
		padding: 10px;
		border: none;
		background: none;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
