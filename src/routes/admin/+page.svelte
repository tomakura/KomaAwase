<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>運営 · コマあわせ</title>
</svelte:head>

{#snippet link(href: string, label: string, open?: number)}
	<a class="ui-row" {href}>
		<span>{label}</span>
		<span class="ui-row-value">
			{#if open !== undefined}<span class="open" class:some={open > 0}>{open ? `${open}件` : 'なし'}</span>{/if}
			<Icon name="chevron" size={16} />
		</span>
	</a>
{/snippet}

<div class="ui-page">
	<PageHeader title="運営" back="/more" />

	<section class="ui-section">
		<h2 class="ui-section-title">対応が必要</h2>
		<div class="ui-list">
			{@render link('/admin/contact', '問い合わせ', data.contact)}
			{@render link('/admin/reports', '通報', data.reports)}
			{@render link('/admin/feedback', '不具合・要望', data.feedback)}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">管理</h2>
		<div class="ui-list">
			{@render link('/admin/users', '利用者（警告・利用停止）')}
			{@render link('/admin/courses', '授業（直す・まとめる）')}
			{@render link('/admin/universities', '利用者が作った大学')}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">数字</h2>
		<div class="ui-list">
			{@render link('/admin/stats', '利用の状況（人数・グラフ）')}
			{@render link('/admin/status', '稼働状況と品質（お知らせ・失敗率）')}
		</div>
	</section>
</div>

<style>
	.open {
		font-size: 13px;
		color: var(--ink-sub);
	}

	.open.some {
		color: var(--accent-text);
		font-weight: 700;
	}
</style>
