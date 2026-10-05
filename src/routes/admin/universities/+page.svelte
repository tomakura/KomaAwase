<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>利用者が作った大学 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="利用者が作った大学" back="/admin" />

	<section class="ui-section">
		<h2 class="ui-section-title">{data.userUniversities.length}件</h2>
		<p class="ui-note">{data.suggestMin}人以上が使うと、ほかの人の入力候補に出ます。不適切な名前は、開いて直すか消してください。</p>
		<div class="ui-list">
			{#each data.userUniversities as u (u.id)}
				<a class="ui-row" href="/admin/universities/{u.id}">
					<span class="uni">{u.name}</span>
					<span class="ui-row-value"><span class="value">{u.users}人</span><Icon name="chevron" size={16} /></span>
				</a>
			{:else}
				<p class="ui-note">ありません。</p>
			{/each}
		</div>
	</section>
</div>

<style>
	.uni {
		overflow-wrap: anywhere;
	}
</style>
