<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>過去の時間割 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="過去の時間割" back="/more" />
	<section class="ui-section">
		{#if data.timetables.length}
			<div class="ui-list">
				{#each data.timetables as t (t.id)}
					<a class="ui-row" href="/timetables/{t.id}">
						<span class="text">
							<span class="year">{t.year}年度</span>
							{#if t.university}<span class="sub">{t.university}</span>{/if}
						</span>
						<span class="ui-row-value">授業{t.courses}件<Icon name="chevron" size={16} /></span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty">まだありません。新しい年度（4月）になると、それまでの時間割がここに移ります。</p>
		{/if}
	</section>
</div>

<style>
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0;
	}

	.year {
		font-weight: 700;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.empty {
		margin: 0;
		padding: 14px 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-sub);
	}
</style>
