<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { makeBackupZip, openBackup, saveBlob } from '$lib/backup';
	import { uploadFile } from '$lib/files';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	type Mode = 'save' | 'replace' | 'merge' | 'add' | 'skip';
	type Preview = {
		exportedAt: string | null;
		events: number;
		timetables: { year: number; name: string; courses: number; files: number; existing: { name: string; courses: number } | null }[];
	};

	const today = () => tokyoTime(Date.now()).date;
	let busy = $state<string | null>(null);
	let message = $state<string | null>(null);
	let done = $state<string | null>(null);

	async function post(action: string, fields: [string, string][]) {
		const body = new FormData();
		for (const [k, v] of fields) body.append(k, v);
		const res = await fetch(`?/${action}`, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		const result = deserialize(await res.text());
		if (result.type === 'success') return result.data ?? {};
		if (result.type === 'failure') throw new Error(String(result.data?.message ?? ''));
		if (result.type === 'error') throw new Error(String(result.error?.message ?? ''));
		throw new Error('');
	}

	async function saveZip() {
		message = done = null;
		busy = '資料を集めています…';
		try {
			const zip = await makeBackupZip((n, total) => (busy = total ? `資料を集めています（${n}/${total}）` : '保存しています…'));
			saveBlob(zip, `komaawase-${today()}.zip`);
		} catch {
			message = '保存できませんでした。通信のよい所でもう一度やり直してください';
		} finally {
			busy = null;
		}
	}

	// --- 戻す ---
	let opened = $state<{ json: string; files: Map<string, Uint8Array> } | null>(null);
	let preview = $state<Preview | null>(null);
	let modes = $state<Mode[]>([]);
	let withEvents = $state(true);
	let confirming = $state(false);
	let fileInput = $state<HTMLInputElement>();

	async function pick(files: FileList | null) {
		const file = files?.[0];
		message = done = null;
		if (!file) return;
		busy = '読んでいます…';
		try {
			opened = await openBackup(file);
			if (!opened) throw new Error('コマあわせで保存したファイルを選んでください');
			const data = (await post('preview', [['json', opened.json]])) as { preview: Preview };
			preview = data.preview;
			modes = preview.timetables.map((t) => (t.existing ? 'save' : 'add'));
		} catch (e) {
			message = (e as Error).message || 'ファイルを読めませんでした';
			reset();
		} finally {
			busy = null;
		}
	}

	function reset() {
		opened = null;
		preview = null;
		modes = [];
		confirming = false;
		if (fileInput) fileInput.value = '';
	}

	const choices = (existing: boolean): { id: Mode; label: string }[] =>
		existing
			? [
					{ id: 'save', label: '今のを保存してから上書き' },
					{ id: 'replace', label: '上書き' },
					{ id: 'merge', label: '今の時間割に足す（ない授業だけ）' },
					{ id: 'skip', label: '戻さない' }
				]
			: [
					{ id: 'add', label: '新しい時間割として追加' },
					{ id: 'skip', label: '戻さない' }
				];

	const label = (mode: Mode) => choices(true).concat(choices(false)).find((c) => c.id === mode)?.label ?? '';
	const nothing = $derived(modes.every((m) => m === 'skip') && !(withEvents && preview?.events));
	const lost = $derived(
		preview ? preview.timetables.reduce((n, t, i) => n + (modes[i] === 'save' || modes[i] === 'replace' ? (t.existing?.courses ?? 0) : 0), 0) : 0
	);

	async function restore() {
		if (!preview || !opened) return;
		message = done = null;
		try {
			// 保存してから上書き: everything as it is now, with the files, before anything changes
			if (modes.includes('save')) {
				busy = '今のデータを保存しています…';
				saveBlob(await makeBackupZip(), `komaawase-${today()}-before.zip`);
			}
			const replaced = preview.timetables.filter((_, i) => modes[i] === 'save' || modes[i] === 'replace').map((t) => String(t.year));
			if (replaced.length) {
				busy = '今の資料を消しています…';
				for (let round = 0; round < 20; round++) {
					const r = (await post('clear', replaced.map((y) => ['year', y]))) as { left: number };
					if (!r.left) break;
				}
			}
			busy = '戻しています…';
			const sent = modes.map((m) => (m === 'save' ? 'replace' : m));
			const r = (await post('restore', [['json', opened.json], ...sent.map((m): [string, string] => ['mode', m]), ...(withEvents ? [['events', 'on'] as [string, string]] : [])])) as {
				restored: { uploads: { courseId: string; name: string; mime: string; path: string }[]; eventCount: number };
			};
			const uploads = r.restored.uploads.filter((u) => opened!.files.has(u.path));
			const failed: string[] = [];
			for (const [n, u] of uploads.entries()) {
				busy = `資料を戻しています（${n + 1}/${uploads.length}）`;
				const bytes = opened.files.get(u.path)!;
				const problem = await uploadFile(u.courseId, new File([bytes as BlobPart], u.name, { type: u.mime }));
				if (problem) failed.push(problem);
			}
			done = ['戻しました。', uploads.length ? `資料は${uploads.length - failed.length}件を戻しました。` : '', failed.length ? `戻せなかった資料：${failed.slice(0, 3).join(' / ')}` : '']
				.filter(Boolean)
				.join('');
			reset();
			await invalidateAll();
		} catch (e) {
			message = (e as Error).message || '戻せませんでした。もう一度やり直してください';
			confirming = false;
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>データの保存と復元 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="データの保存と復元" back="/more/account" />

	<section class="ui-section">
		<h2 class="ui-section-title">保存する</h2>
		<div class="ui-list">
			<a class="ui-row" href="/more/data" download data-sveltekit-reload>
				<span class="text">JSON で保存<span class="sub">時間割・メモ・予定など。資料のファイルは入りません。</span></span>
				<span class="ui-row-value"><Icon name="download" size={16} /></span>
			</a>
			{#if data.filesOn}
				<button class="ui-row" type="button" onclick={saveZip} disabled={!!busy}>
					<span class="text">資料も入れて ZIP で保存<span class="sub">授業の資料のファイルもまとめます。資料が多いと時間がかかります。</span></span>
					<span class="ui-row-value"><Icon name="download" size={16} /></span>
				</button>
			{/if}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">保存したデータから戻す</h2>
		{#if !preview}
			<p class="ui-note">ここで保存した JSON か ZIP を選んでください。戻す前に、時間割ごとにどうするか選べます。</p>
			<label class="btn file" class:disabled={!!busy}>
				ファイルを選ぶ
				<input bind:this={fileInput} type="file" accept=".json,.zip,application/json,application/zip" disabled={!!busy} onchange={(e) => pick(e.currentTarget.files)} />
			</label>
		{:else if !confirming}
			{#if preview.exportedAt}<p class="ui-note">{tokyoTime(Date.parse(preview.exportedAt)).date.replace(/-/g, '/')} に保存したファイルです。</p>{/if}
			{#each preview.timetables as t, i (t.year)}
				<fieldset class="table">
					<legend>{t.name}<small>授業{t.courses}件{t.files ? `・資料${t.files}件` : ''}</small></legend>
					{#if t.existing}
						<p class="ui-note">この年度の時間割がすでにあります（授業{t.existing.courses}件）。</p>
					{/if}
					{#each choices(!!t.existing) as c (c.id)}
						<label class="option">
							<input type="radio" name="mode-{i}" value={c.id} bind:group={modes[i]} />
							<span>{c.label}</span>
						</label>
					{/each}
					{#if (modes[i] === 'save' || modes[i] === 'replace') && t.existing?.courses}
						<p class="warn">今の授業{t.existing.courses}件と、そのメモ・欠席・資料は消えます。</p>
					{/if}
				</fieldset>
			{/each}
			{#if preview.events}
				<label class="option">
					<input type="checkbox" bind:checked={withEvents} />
					<span>予定も戻す（{preview.events}件。同じ予定がすでにあれば足しません）</span>
				</label>
			{/if}
			{#if !opened?.files.size && preview.timetables.some((t) => t.files)}
				<p class="ui-note">JSON には資料のファイルが入っていないので、資料は戻りません。</p>
			{/if}
			<div class="actions">
				<button class="btn" type="button" onclick={reset}>やめる</button>
				<button class="btn btn-primary" type="button" disabled={nothing} onclick={() => (confirming = true)}>戻す</button>
			</div>
		{:else}
			<p class="ui-note">これで戻します。よければ「戻す」を押してください。</p>
			<ul class="summary">
				{#each preview.timetables as t, i (t.year)}
					<li>{t.name}：{label(modes[i])}</li>
				{/each}
				{#if preview.events}<li>予定：{withEvents ? '戻す' : '戻さない'}</li>{/if}
			</ul>
			{#if lost}<p class="warn">今の授業{lost}件は消えます。元には戻せません。</p>{/if}
			<div class="actions">
				<button class="btn" type="button" disabled={!!busy} onclick={reset}>やめる</button>
				<button class="btn btn-primary" type="button" disabled={!!busy} onclick={restore}>戻す</button>
			</div>
		{/if}
	</section>

	{#if busy}<p class="ui-note status" role="status">{busy}</p>{/if}
	{#if message}<p class="error pad" role="alert">{message}</p>{/if}
	{#if done}<p class="ui-note status" role="status">{done}</p>{/if}
</div>

<style>
	button.ui-row {
		width: 100%;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 0;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.file {
		position: relative;
		overflow: hidden;
		margin-top: 10px;
	}

	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.file.disabled {
		opacity: 0.5;
	}

	.table {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 0 12px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	legend {
		display: contents;
		font-weight: 700;
	}

	legend small {
		margin-left: 8px;
		font-weight: 400;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.option {
		min-height: 40px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.option input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--ink);
	}

	.warn {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--accent-text);
	}

	.summary {
		margin: 8px 0;
		padding-left: 20px;
		font-size: 14px;
		line-height: 1.8;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 12px;
	}

	.status,
	.pad {
		padding: 0 16px;
	}
</style>
