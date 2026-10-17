<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { RELEASES } from '$lib/releases';
	import { APP_VERSION, prVersion } from '$lib/version';

	const day = (date: string) => {
		const [y, m, d] = date.split('-').map(Number);
		return `${y}年${m}月${d}日`;
	};
</script>

<LegalPage title="更新情報" back="/about" updated="今のバージョン {APP_VERSION}">
	{#each RELEASES as release (release.pr)}
		<h2>{prVersion(release.pr) ?? day(release.date)}</h2>
		<ul>
			{#each release.items as item, i (i)}
				<li>{item}</li>
			{/each}
		</ul>
	{/each}
</LegalPage>
