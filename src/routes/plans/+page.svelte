<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { ask } from '$lib/confirm.svelte';
	import { offerUndo } from '$lib/toast.svelte';
	import { draft } from '$lib/draft';
	import { slide } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { motion } from '$lib/motion';
	import { SECTIONS, dueLabel, groupPlans, whenLabel, type Plan } from '$lib/plans';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	const today = $derived(tokyoTime(data.now).date);
	const groups = $derived(groupPlans(data.plans, today));
	const shown = $derived(SECTIONS.filter((s) => s.id !== 'past' && groups[s.id].length));
	const empty = $derived(shown.length === 0 && groups.past.length === 0);

	// The sheet for adding, or for changing an event (`editing`)
	let open = $state(false);
	let kind = $state<'task' | 'event'>('task');
	let editing = $state<Plan | null>(null);
	let allDay = $state(false);
	const kinds = [
		{ id: 'task', label: '課題' },
		{ id: 'event', label: 'イベント' }
	] as const;

	function add() {
		editing = null;
		allDay = false;
		kind = data.courses.length ? 'task' : 'event';
		open = true;
	}

	function edit(p: Plan) {
		editing = p;
		allDay = !p.start;
		kind = 'event';
		open = true;
	}

	const subLine = (p: Plan) => [p.kind === 'event' ? whenLabel(p) : '', p.place, p.course].filter(Boolean).join(' · ');
</script>

<svelte:head>
	<title>予定 · コマあわせ</title>
</svelte:head>

{#snippet row(p: Plan)}
	<div transition:slide={motion()} class="row" class:done={p.done}>
		{#if p.kind === 'task'}
			<form method="POST" action="?/done" use:enhance>
				<input type="hidden" name="id" value={p.id} />
				<input type="hidden" name="courseId" value={p.courseId} />
				<input
					class="check"
					type="checkbox"
					name="done"
					checked={p.done}
					aria-label="{p.title}を終わったことにする"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</form>
			<a class="text" href="/courses/{p.courseId}">
				<span class="title">{p.title}</span>
				<span class="sub">{subLine(p)}</span>
			</a>
			{#if p.date && !p.done}
				{@const due = dueLabel(p.date, today)}
				<span class="due" class:late={due.late}>{due.text}</span>
			{/if}
		{:else}
			<span class="dot" aria-hidden="true"></span>
			<button class="text" type="button" onclick={() => edit(p)}>
				<span class="title">{p.title}</span>
				<span class="sub">{subLine(p)}</span>
			</button>
		{/if}
	</div>
{/snippet}

<div class="screen">
	<header>
		<h1>予定</h1>
		<button class="add" type="button" onclick={add}><Icon name="plus" size={18} />追加</button>
	</header>

	<main>
		{#each shown as s (s.id)}
			<section class="ui-section">
				<h2 class="ui-section-title" class:late={s.id === 'late'}>{s.label}</h2>
				<div class="ui-list">
					{#each groups[s.id] as p (p.id)}
						{@render row(p)}
					{/each}
				</div>
				{#if s.id === 'open'}<p class="ui-note">日付を入れると、締め切りの近い順に並びます。</p>{/if}
			</section>
		{/each}

		{#if empty}
			<div class="empty">
				<p>まだ予定がありません。右上の「追加」から、課題やイベントを入れられます。</p>
			</div>
		{/if}

		{#if groups.past.length}
			<details class="past">
				<summary>過ぎたもの・済んだもの（{groups.past.length}）</summary>
				<div class="ui-list">
					{#each groups.past as p (p.id)}
						{@render row(p)}
					{/each}
				</div>
			</details>
		{/if}
	</main>

	<BottomNav current="plans" />
</div>

<Sheet bind:open title={editing ? 'イベントを直す' : '予定を追加'}>
	{#if !editing}
		<Segmented options={kinds} bind:value={kind} label="追加するもの" />
	{/if}

	{#key `${kind}-${editing?.id ?? ''}`}
		<form
			class="add-form"
			method="POST"
			action={editing ? '?/updateEvent' : kind === 'task' ? '?/addTask' : '?/addEvent'}
			use:draft={editing ? null : `plans:${kind}`}
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') open = false;
				}}
		>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			{#if kind === 'task'}
				<label class="field">
					授業
					<select name="courseId" required>
						<option value="" disabled selected>選んでください</option>
						{#each data.courses as c (c.id)}<option value={c.id}>{c.title}</option>{/each}
					</select>
				</label>
				<label class="field">課題<input name="body" maxlength="100" required autocomplete="off" /></label>
				<label class="field">締め切り（日付）<input type="date" name="due" /></label>
			{:else}
				<label class="field">名前<input name="title" maxlength="100" required autocomplete="off" value={editing?.title ?? ''} /></label>
				<label class="field">日付<input type="date" name="date" required value={editing?.date ?? today} /></label>
				<div class="all-day">
					<span id="all-day-label">終日</span>
					<Switch bind:checked={allDay} name="allDay" labelledby="all-day-label" />
				</div>
				{#if !allDay}
					<div class="times">
						<label class="field">はじまり<input type="time" name="start" value={editing?.start ?? ''} /></label>
						<label class="field">終わり<input type="time" name="end" value={editing?.end ?? ''} /></label>
					</div>
				{/if}
				<label class="field">場所<input name="place" maxlength="50" autocomplete="off" value={editing?.place ?? ''} /></label>
				<label class="field">
					授業
					<select name="courseId">
						<option value="">なし</option>
						{#each data.courses as c (c.id)}<option value={c.id} selected={editing?.courseId === c.id}>{c.title}</option>{/each}
					</select>
				</label>
				<label class="field">メモ<textarea name="memo" rows="3" maxlength="500">{editing?.memo ?? ''}</textarea></label>
			{/if}
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<div class="form-actions">
				<button class="btn" type="button" onclick={() => (open = false)}>やめる</button>
				<button class="btn btn-primary" type="submit">{editing ? '保存' : '追加'}</button>
			</div>
		</form>
		{#if editing}
			<form
				method="POST"
				action="?/removeEvent"
				use:enhance={async ({ cancel }) => {
					if (!(await ask({ message: `イベント「${editing?.title}」を消します`, ok: '消す', danger: true }))) return cancel();
					return async ({ result, update }) => {
						await update();
						open = false;
						offerUndo(result, invalidateAll);
					};
				}}
			>
				<input type="hidden" name="id" value={editing.id} />
				<button class="btn remove-event" type="submit"><Icon name="trash" size={18} />このイベントを消す</button>
			</form>
		{/if}
	{/key}
</Sheet>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 0 16px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 22px;
	}

	.add {
		height: 40px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 14px 0 10px;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
	}

	main {
		display: flex;
		flex-direction: column;
		padding-bottom: 28px;
	}

	.ui-section-title.late {
		color: var(--accent-text);
	}

	.row {
		min-height: 56px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 14px;
	}

	.row.done .title {
		text-decoration: line-through;
		color: var(--ink-sub);
	}

	.check {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		margin: 0;
		accent-color: var(--ink);
	}

	.dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		margin: 0 6px;
		border-radius: 50%;
		background: var(--ink-sub);
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0;
		border: none;
		background: none;
		color: var(--ink);
		font-family: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.title {
		font-size: 15px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
		overflow-wrap: anywhere;
	}

	.due {
		flex-shrink: 0;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.due.late {
		color: var(--accent-text);
		font-weight: 700;
	}

	.empty {
		padding: 40px 24px;
		text-align: center;
		color: var(--ink-sub);
		font-size: 14px;
		line-height: 1.7;
	}

	.past {
		padding: 18px 16px 0;
	}

	.past summary {
		padding: 0 4px 6px;
		font-size: 12px;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.add-form :global(select),
	.add-form :global(textarea) {
		box-sizing: border-box;
		width: 100%;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.add-form :global(select) {
		height: 48px;
	}

	.add-form :global(textarea) {
		padding: 10px 12px;
		resize: vertical;
	}

	.all-day {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 48px;
		padding: 0 4px;
		font-size: 14px;
	}

	.times {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.times :global(input) {
		min-width: 0;
	}

	.form-actions {
		display: flex;
		gap: 10px;
	}

	.form-actions .btn {
		flex: 1;
	}

	.remove-event {
		width: 100%;
		color: var(--accent-text);
	}
</style>
