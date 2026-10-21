<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { RELEASES } from '$lib/releases';
	import { APP_HISTORY, APP_VERSION } from '$lib/version';

	const day = (date: string) => {
		const [y, m, d] = date.split('-').map(Number);
		return `${y}年${m}月${d}日`;
	};

	// Every version in order, so none is skipped. One with no entry in releases.ts is a 軽微な修正.
	// Without the build's history, the entries alone under their dates.
	const entries = APP_HISTORY.length
		? APP_HISTORY.map(({ version, pr }) => ({
				heading: version,
				items: RELEASES.find((r) => r.pr === pr)?.items ?? ['軽微な修正']
			}))
		: RELEASES.map((r) => ({ heading: day(r.date), items: r.items }));
</script>

<LegalPage title="更新情報" back="/about" updated="今のバージョン {APP_VERSION}">
	{#each entries as entry, i (i)}
		<h2>{entry.heading}</h2>
		<ul>
			{#each entry.items as item, j (j)}
				<li>{item}</li>
			{/each}
		</ul>
	{/each}
</LegalPage>
