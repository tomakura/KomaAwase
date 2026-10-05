<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { LEVEL_LABELS, NOTE_LABELS, fetchStatus, type StatusAnswer } from '$lib/status';
	import { tokyoTime } from '$lib/time';

	// Read in the browser, so the page opens offline too (src/lib/sync.ts) and says so there
	let status = $state<StatusAnswer | null>(null);
	let phase = $state<'loading' | 'done' | 'failed'>('loading');

	async function load() {
		phase = 'loading';
		status = await fetchStatus();
		phase = status ? 'done' : 'failed';
	}

	$effect(() => {
		void load();
	});

	const when = (ms: number) => {
		const t = tokyoTime(ms);
		const m = Math.floor(t.minutes);
		return `${Number(t.date.slice(5, 7))}月${Number(t.date.slice(8))}日 ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
	const open = $derived(status?.notes.filter((n) => !n.resolvedAt) ?? []);
	const resolved = $derived(status?.notes.filter((n) => n.resolvedAt) ?? []);
</script>

<svelte:head>
	<title>稼働状況 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="稼働状況" back="/more" />

	<div class="body">
		{#if phase === 'loading' && !status}
			<p class="ui-note">読み込んでいます…</p>
		{:else if phase === 'failed'}
			<p class="failed" role="alert">情報を取得できません。通信できるところで、もう一度開いてください。</p>
			<button class="btn" type="button" onclick={load}>もう一度読み込む</button>
		{:else if status}
			<section>
				<h2>運営からのお知らせ</h2>
				{#each open as n (n.id)}
					<div class="note" class:trouble={n.level === 'trouble'}>
						<span class="tag">{NOTE_LABELS[n.level]}</span>
						<p>{n.body}</p>
						<span class="date">{when(n.createdAt)}</span>
					</div>
				{:else}
					<p class="ui-note">いまは、お知らせはありません。</p>
				{/each}
			</section>

			<section>
				<h2>いまの様子</h2>
				<div class="ui-list">
					{#each status.signals as s (s.id)}
						<div class="ui-row signal">
							<span class="text"><b>{s.label}</b>{s.text}</span>
							<span class="level {s.level}">{LEVEL_LABELS[s.level]}</span>
						</div>
					{/each}
				</div>
				<p class="ui-note">{when(status.at)} 時点</p>
			</section>

			{#if resolved.length}
				<section>
					<h2>この1週間に解決したこと</h2>
					{#each resolved as n (n.id)}
						<div class="note done">
							<span class="tag">解決</span>
							<p>{n.body}</p>
							<span class="date">{when(n.createdAt)} 〜 {when(n.resolvedAt ?? n.createdAt)}</span>
						</div>
					{/each}
				</section>
			{/if}
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 6px 16px 24px;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}

	.failed {
		padding: 14px;
		border-radius: 12px;
		background: var(--slot);
	}

	.note {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.note.trouble {
		border-color: var(--accent-text);
	}

	.note p {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.tag {
		align-self: flex-start;
		padding: 1px 8px;
		border-radius: 5px;
		background: var(--slot);
		font-size: 11px;
		font-weight: 700;
	}

	.trouble .tag {
		background: var(--accent-text);
		color: var(--surface);
	}

	.date {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.signal {
		padding: 10px 14px;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.text b {
		font-size: 14px;
		color: var(--ink);
	}

	.level {
		flex: none;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--course-green);
		font-size: 12px;
		font-weight: 700;
	}

	.level.slow {
		background: var(--course-yellow);
	}

	.level.down {
		background: var(--accent-text);
		color: var(--surface);
	}
</style>
