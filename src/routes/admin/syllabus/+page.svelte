<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data, form } = $props();

	// The file is read here and sent as text, so 確かめる and 取り込む send the same one
	let text = $state('');
	let name = $state('');
	// svelte-ignore state_referenced_locally
	let university = $state(data.universities[0]?.id ?? '');
	let busy = $state(false);

	async function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		text = file ? await file.text() : '';
		name = file?.name ?? '';
	}

	// What 確かめる was pressed with: the plan shown is for that file and university only
	let checkedWith = $state('');
	const key = $derived(`${university}\n${text}`);
	const checked = $derived(form && 'checked' in form && checkedWith === key ? form.checked : null);
	const SHOWN = 100;
</script>

<svelte:head>
	<title>シラバスの取り込み · 運営 · コマあわせ</title>
</svelte:head>

{#snippet list(items: { code: string; title: string; detail: string; from?: string; changes?: { label: string; before: string; after: string }[] }[])}
	<div class="items">
		{#each items.slice(0, SHOWN) as c (c.code)}
			<div class="item">
				<span class="title">{c.title} <span class="code">{c.code}</span></span>
				{#if c.from}<span class="sub">みんなの登録「{c.from}」をつなぐ</span>{/if}
				{#if c.detail}<span class="sub">{c.detail}</span>{/if}
				{#each c.changes ?? [] as ch (ch.label)}
					<span class="sub change">{ch.label}：{ch.before} → {ch.after}</span>
				{/each}
			</div>
		{/each}
		{#if items.length > SHOWN}<p class="ui-note">ほか{items.length - SHOWN}件</p>{/if}
	</div>
{/snippet}

<div class="ui-page">
	<PageHeader title="シラバスの取り込み" back="/admin" />

	<section class="ui-section">
		<p class="ui-note">scripts/syllabus で書き出したファイルを選んで、まず中身を確かめてから取り込みます。授業コードで同じ授業を見分けるので、同じファイルをもう一度取り込んでも増えません。教室は消えません。</p>
		<form
			method="POST"
			use:enhance={async ({ action, cancel }) => {
				if (action.search.includes('apply') && !(await ask({ message: 'シラバスの内容を、みんなの授業データに取り込みます', ok: '取り込む' }))) {
					return cancel();
				}
				busy = true;
				const sent = key;
				return async ({ update }) => {
					await update({ reset: false });
					checkedWith = sent;
					busy = false;
				};
			}}
		>
			<label class="field">
				大学
				<select name="university" bind:value={university}>
					{#each data.universities as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
				</select>
			</label>
			<label class="field">
				ファイル（JSON）
				<input type="file" accept="application/json,.json" onchange={pick} />
			</label>
			<input type="hidden" name="file" value={text} />
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			{#if form && 'applied' in form && form.applied}
				<p class="ui-note" role="status">
					取り込みました。新しく{form.applied.add}件、更新{form.applied.update}件、つないだ授業{form.applied.link}件、変わらない授業{form.applied.same}件です。
				</p>
			{/if}
			<div class="buttons">
				<button class="btn" type="submit" formaction="?/check" disabled={!text || busy}>確かめる</button>
				<button class="btn btn-primary" type="submit" formaction="?/apply" disabled={!checked || !text || busy}>取り込む</button>
			</div>
			{#if name}<p class="ui-note">{name}</p>{/if}
		</form>
	</section>

	{#if checked}
		{#each form && 'warnings' in form ? form.warnings : [] as w (w)}
			<p class="error">{w}</p>
		{/each}
		<section class="ui-section">
			<h2 class="ui-section-title">{checked.year}年度 · 新しく入る授業 {checked.add.length}件</h2>
			{@render list(checked.add)}
		</section>
		{#if checked.link.length}
			<section class="ui-section">
				<h2 class="ui-section-title">シラバスとつなぐ「みんなの登録」 {checked.link.length}件</h2>
				{@render list(checked.link)}
			</section>
		{/if}
		<section class="ui-section">
			<h2 class="ui-section-title">内容が変わる授業 {checked.update.length}件</h2>
			{@render list(checked.update)}
		</section>
		<section class="ui-section">
			<h2 class="ui-section-title">変わらない授業 {checked.same}件</h2>
		</section>
		{#if checked.missing.length}
			<section class="ui-section">
				<h2 class="ui-section-title">シラバスにない授業 {checked.missing.length}件</h2>
				<p class="ui-note">このファイルにない、前に取り込んだ授業です。消さずに残します。別の学期を取り込んでいないだけのこともあります。</p>
				{@render list(checked.missing)}
			</section>
		{/if}
	{/if}
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.field {
		display: grid;
		gap: 6px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	select,
	input[type='file'] {
		box-sizing: border-box;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.items {
		display: grid;
		gap: 8px;
	}

	.item {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.title {
		font-size: 14px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.code {
		font-weight: 400;
		color: var(--ink-sub);
		font-size: 12px;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.change {
		color: var(--ink);
	}
</style>
