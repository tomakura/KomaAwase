<script lang="ts">
	import { enhance } from '$app/forms';
	import ImportReview from '$lib/components/ImportReview.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { CSV_COLUMNS, CSV_TEMPLATE } from '$lib/csv';

	let { data, form } = $props();

	// Kept once read, so a failed save shows its message over the same review
	type Read = { groups: NonNullable<NonNullable<typeof form>['groups']>; skipped: number[]; cut: boolean };
	let read = $state<Read | null>(null);
	$effect(() => {
		if (form && 'groups' in form && form.groups) read = { groups: form.groups, skipped: form.skipped ?? [], cut: !!form.cut };
	});

	let text = $state('');
	let fileName = $state('');
	let reading = $state(false);

	// Excel saves CSV as Shift_JIS on Japanese Windows; anything that isn't valid UTF-8 is read as that
	async function pick(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		fileName = file.name;
		const bytes = await file.arrayBuffer();
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			text = new TextDecoder('shift_jis').decode(bytes);
		}
	}

	function downloadTemplate() {
		// With a BOM so Excel opens it as UTF-8
		const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'komaawase-template.csv';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	const skippedNote = (lines: number[]) =>
		lines.length ? `${lines.slice(0, 10).join('・')}行目${lines.length > 10 ? 'など' : ''}は、授業名・曜日・時限が読めなかったので外しました。` : '';
</script>

<svelte:head>
	<title>CSV から入力 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="CSV から入力" back="/" />

	{#if read}
		{#if read.skipped.length || read.cut}
			<p class="ui-note pad">
				{skippedNote(read.skipped)}{read.cut ? '授業が多いので、初めの分だけ読みました。' : ''}
			</p>
		{/if}
		<ImportReview
			terms={data.terms}
			periods={data.periods}
			existing={data.existing}
			defaultTerm={data.defaultTerm}
			canShare={data.canShare}
			groups={read.groups}
			action="?/save"
			message={form && !('groups' in form) ? form.message : undefined}
			lead="CSV から読んだ内容です。授業名・曜日・時限・教室を、保存する前に見直してください。"
		/>
		<div class="again">
			<button class="link" type="button" onclick={() => ((read = null), (text = ''), (fileName = ''))}>別のファイルを選ぶ</button>
		</div>
	{:else}
		<form
			class="body"
			method="POST"
			action="?/read"
			use:enhance={() => {
				reading = true;
				return async ({ update }) => {
					await update({ reset: false });
					reading = false;
				};
			}}
		>
			<p class="lead">表計算ソフトで作った授業の一覧を、まとめて登録できます。</p>
			<div class="ui-list">
				<div class="ui-row"><span>列</span><span class="ui-row-value cols">{CSV_COLUMNS.join('、')}</span></div>
			</div>
			<p class="ui-note">1行目は見出しにしてください。曜日は「月」「火」…、時限は数字で書きます。コマ数・教室・先生・単位は空でもかまいません。先生が複数なら「、」で区切ります。</p>
			<button class="btn" type="button" onclick={downloadTemplate}>ひな形をダウンロード</button>

			<label class="btn file">
				{fileName || 'CSV ファイルを選ぶ'}
				<input type="file" accept=".csv,text/csv" onchange={(e) => pick(e.currentTarget.files)} />
			</label>
			<input type="hidden" name="csv" value={text} />
			{#if form && 'message' in form && form.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit" disabled={!text || reading}>{reading ? '読んでいます…' : '読み込む'}</button>
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

	.pad {
		padding: 0 16px;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	.cols {
		white-space: normal;
		text-align: right;
	}

	.file {
		position: relative;
		overflow: hidden;
	}

	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.again {
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
