<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { ask } from '$lib/confirm.svelte';
	import { LEVEL_LABELS, NOTE_LABELS } from '$lib/status';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.slice(5).replace('-', '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};
	const percent = (bad: number, good: number) => (bad + good ? `${Math.round((bad / (bad + good)) * 100)}%` : '-');
	const open = $derived(data.notes.filter((n) => !n.resolvedAt));
</script>

<svelte:head>
	<title>稼働状況と品質 · 運営 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="稼働状況と品質" back="/admin" />

	<section class="ui-section">
		<h2 class="ui-section-title">お知らせを出す（稼働状況ページとアプリの上に出ます）</h2>
		<form class="add" method="POST" action="?/add" use:enhance>
			<select name="level" aria-label="種類">
				<option value="trouble">{NOTE_LABELS.trouble}</option>
				<option value="info">{NOTE_LABELS.info}</option>
			</select>
			<textarea name="body" rows="3" maxlength="300" required placeholder="スクショの読み取りが遅れています。順に読み取っています。"></textarea>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit">出す</button>
		</form>
		{#if form?.syncFailed}
			<form class="add" method="POST" action="?/sync" use:enhance>
				<p class="error" role="alert">{form.syncFailed}</p>
				<button class="btn" type="submit">もう一度反映する</button>
			</form>
		{/if}
		{#each open as n (n.id)}
			<div class="note">
				<span class="tag">{NOTE_LABELS[n.level]}</span>
				<p>{n.body}</p>
				<div class="foot">
					<span class="date">{when(n.createdAt)}から</span>
					<form
						method="POST"
						action="?/resolve"
						use:enhance={async ({ cancel }) => {
							if (!(await ask({ message: 'このお知らせを「解決」にします。アプリの上の帯も消えます', ok: '解決にする' }))) return cancel();
						}}
					>
						<input type="hidden" name="id" value={n.id} />
						<button class="small" type="submit">解決にする</button>
					</form>
				</div>
			</div>
		{/each}
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">いまの様子（稼働状況ページは1分ごとに確認）</h2>
		<div class="ui-list">
			{#each data.signals as s (s.id)}
				<div class="ui-row"><span>{s.label}</span><span class="ui-row-value">{LEVEL_LABELS[s.level]} · {s.text}</span></div>
			{/each}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">日ごとの数（直近7日）</h2>
		<div class="table">
			<table>
				<thead>
					<tr><th>日</th><th>エラー</th><th>通知の失敗</th><th>通知の遅れ</th><th>読み取り</th><th>失敗</th><th>平均</th><th>メール失敗</th></tr>
				</thead>
				<tbody>
					{#each data.days as d (d.day)}
						<tr>
							<td>{d.day.slice(5).replace('-', '/')}</td>
							<td>{d.errors}</td>
							<td>{percent(d.pushFailed, d.pushOk)}</td>
							<td>{d.notifyLateSec === null ? '-' : `${d.notifyLateSec}秒`}{d.notifyLate ? `（10秒以上 ${d.notifyLate}回）` : ''}</td>
							<td>{d.importOk + d.importFailed}</td>
							<td>{percent(d.importFailed, d.importOk)}</td>
							<td>{d.importAvgMin === null ? '-' : `${d.importAvgMin}分`}</td>
							<td>{d.mailFailed}</td>
						</tr>
					{:else}
						<tr><td colspan="8">まだ数がありません</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="ui-note">件数と時間だけを数えています。だれのものか、どのページかは記録していません。30日で消えます。</p>
	</section>
</div>

<style>
	.add {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	select,
	textarea {
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
	}

	select {
		align-self: flex-start;
	}

	.note {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.note p {
		margin: 0;
		font-size: 14px;
		white-space: pre-wrap;
	}

	.tag {
		align-self: flex-start;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		font-size: 11px;
		font-weight: 700;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.date {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.small {
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.error {
		margin: 0;
		font-size: 12px;
		color: var(--accent-text);
	}

	.table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th,
	td {
		padding: 6px 4px;
		border-bottom: 1px solid var(--line);
		text-align: right;
		white-space: nowrap;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	th {
		font-weight: 400;
		color: var(--ink-sub);
	}
</style>
