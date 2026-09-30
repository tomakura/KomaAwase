<script lang="ts">
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/motion';
	import Switch from '$lib/components/Switch.svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { swipeDown } from '$lib/swipe';
	import { wrapTitle } from '$lib/wrap-title';
	import {
		DAY_NAMES,
		actionHref,
		courseColor,
		courseHref,
		deliveryLabel,
		periodLabel,
		timetableHref,
		weekLabel
	} from '$lib/courses';
	import { FILE_ACCEPT, fileBadge, formatBytes, uploadFile } from '$lib/files';
	import { whenLabel } from '$lib/plans';
	import { addDays, daysBetween, monthDay, tokyoTime, weekdayOf } from '$lib/time';

	let { data, form } = $props();

	const course = $derived(data.course);
	const periodNumbers = $derived(data.periods.map((p) => p.number));
	const slotLabels = $derived(
		course.slots.map(
			(s) => `${DAY_NAMES[s.weekday]} ${periodLabel(s.period, s.span, periodNumbers)}${weekLabel(s.week) ? `（${weekLabel(s.week)}）` : ''}`
		)
	);
	const termNames = $derived(
		data.terms
			.filter((t) => course.termIds.includes(t.id))
			.map((t) => t.name)
			.join('・')
	);
	const delivery = $derived(deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo));

	let adding = $state<'memo' | 'task' | 'cancel' | 'event' | null>(null);
	let allDay = $state(false);

	// 10/2（金）
	const withDay = (date: string) => `${monthDay(date)}（${DAY_NAMES[weekdayOf(date)]}）`;

	// The next day this course meets, as the default day to mark cancelled
	const nextClassDay = $derived(
		[0, 1, 2, 3, 4, 5, 6]
			.map((n) => addDays(data.today, n))
			.find((d) => course.slots.some((s) => s.weekday === weekdayOf(d))) ?? data.today
	);

	const tasks = $derived(
		data.notes
			.filter((n) => n.kind === 'task')
			.toSorted((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9'))
	);
	const cancels = $derived(
		data.notes
			.filter((n) => n.kind === 'cancel' && n.date)
			.toSorted((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
	);
	const memos = $derived(
		data.notes
			.filter((n) => n.kind === 'memo')
			.toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
	);

	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	let uploadErrors = $state<string[]>([]);

	async function upload(files: FileList | null) {
		if (!files?.length) return;
		uploading = true;
		uploadErrors = [];
		for (const file of files) {
			const message = await uploadFile(course.id, file);
			if (message) uploadErrors.push(message);
		}
		if (fileInput) fileInput.value = '';
		await invalidateAll();
		uploading = false;
	}

	// Absences: recorded by date, one a day
	const absentToday = $derived(data.absences.some((a) => a.date === data.today));
	const absenceLeft = $derived(course.absenceLimit ? course.absenceLimit - data.absences.length : null);

	function dueLabel(due: string) {
		const days = daysBetween(data.today, due);
		if (days > 0) return { text: `あと${days}日`, late: false };
		if (days === 0) return { text: '今日まで', late: false };
		return { text: `${-days}日過ぎ`, late: true };
	}
</script>

{#snippet removeButton(id: string, label: string, action = 'remove')}
	<form
		method="POST"
		action={actionHref(action, data.termParam)}
		use:enhance={({ cancel }) => {
			if (!confirm(`${label}を消します`)) cancel();
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button class="remove" type="submit" aria-label="{label}を消す">
			<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</form>
{/snippet}

<svelte:head>
	<title>{course.title} · コマあわせ</title>
</svelte:head>

<div class="page">
	<a class="scrim" href={timetableHref(data.termParam)} aria-label="閉じて時間割にもどる"></a>

	<div class="sheet course-sheet" use:swipeDown={() => goto(timetableHref(data.termParam))}>
		<div class="grabber"><span></span></div>

		<div class="head">
			<div class="title-row">
				<div class="name">
					<span class="bar" style:--c={courseColor(course.color)}></span>
					{#key course.title}<h1 use:wrapTitle={course.title}>{course.title}</h1>{/key}
				</div>
				<a class="edit" href={courseHref(course.id, data.termParam, '/edit')}>
					<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z" />
					</svg>
					編集
				</a>
			</div>
			<div class="chips">
				{#each course.slots as slot, i (i)}
					<span class="chip"><b>{slotLabels[i]}</b>{#if slot.room}&nbsp;· {slot.room}{/if}</span>
				{/each}
				{#if delivery}<span class="chip"><b>{delivery}</b></span>{/if}
				{#if course.credits}<span class="chip muted">{course.credits}単位</span>{/if}
				{#if termNames}<span class="chip muted">{termNames}</span>{/if}
				{#if course.syncMode === 'synced' && data.shared}
					<span class="chip muted synced">
						<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
						</svg>
						みんなと同期中
					</span>
				{/if}
			</div>
			{#if course.teachers.length}
				<span class="teachers">{course.teachers.join('・')}</span>
			{/if}
			{#if data.shared && data.shareable}
				<a class="shared-link" href="/shared/{data.shared.id}?back={encodeURIComponent(courseHref(course.id, data.termParam))}">
					みんなの授業データ（変更の履歴・報告）
				</a>
			{:else if data.shared}
				<a class="shared-link" href="/more/verify">在籍確認をすると、みんなの授業データを見られます</a>
			{/if}
		</div>

		<h2 class="add-heading">追加する</h2>
		<div class="add-buttons">
			<button type="button" aria-pressed={adding === 'memo'} onclick={() => (adding = adding === 'memo' ? null : 'memo')}>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M5 4.5h10l4 4v11H5z" /><path d="M14.5 4.5v4h4M8 12.5h8M8 16h5" />
				</svg>
				メモ
			</button>
			<button
				type="button"
				disabled={!data.filesEnabled || uploading}
				title={data.filesEnabled ? undefined : '準備中'}
				onclick={() => fileInput?.click()}
			>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M17 8l-7.5 7.5a2.1 2.1 0 0 1-3-3L14 5a3.8 3.8 0 0 1 5.4 5.4l-7.7 7.7a5.4 5.4 0 0 1-7.6-7.6L10.5 4" />
				</svg>
				{uploading ? '送信中…' : '資料'}
			</button>
			<button type="button" aria-pressed={adding === 'task'} onclick={() => (adding = adding === 'task' ? null : 'task')}>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.2l2.5 2.5 4.8-5" />
				</svg>
				課題
			</button>
			<button
				type="button"
				aria-pressed={adding === 'cancel'}
				onclick={() => (adding = adding === 'cancel' ? null : 'cancel')}
			>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3.5" y="5" width="17" height="15" rx="2.5" />
					<path d="M3.5 9.5h17M8 3v4M16 3v4M10 12.5l4 4M14 12.5l-4 4" />
				</svg>
				休講
			</button>
			<button type="button" aria-pressed={adding === 'event'} onclick={() => ((allDay = false), (adding = adding === 'event' ? null : 'event'))}>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3.5" y="5" width="17" height="15" rx="2.5" />
					<path d="M3.5 9.5h17M8 3v4M16 3v4M8.5 14.5h7" />
				</svg>
				イベント
			</button>
		</div>

		<input
			class="file-input"
			type="file"
			multiple
			accept={FILE_ACCEPT}
			bind:this={fileInput}
			onchange={(e) => upload(e.currentTarget.files)}
		/>
		{#each uploadErrors as message, i (i)}<p class="error block" role="alert">{message}</p>{/each}
		{#if form?.message && !adding}<p class="error block" role="alert">{form.message}</p>{/if}

		{#if adding}
			<form
				class="add-form"
				method="POST"
				action={actionHref(adding === 'event' ? 'event' : 'note', data.termParam)}
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') adding = null;
					}}
			>
				{#if adding !== 'event'}<input type="hidden" name="kind" value={adding} />{/if}
				{#if adding === 'memo'}
					<label class="field">日付<input type="date" name="date" value={data.today} required /></label>
					<label class="field">メモ<textarea name="body" rows="4" maxlength="1000" required></textarea></label>
				{:else if adding === 'task'}
					<label class="field">課題<input name="body" maxlength="100" required autocomplete="off" /></label>
					<label class="field">締切（任意）<input type="date" name="due" /></label>
				{:else if adding === 'event'}
					<label class="field">名前<input name="title" maxlength="100" required autocomplete="off" placeholder="期末試験" /></label>
					<label class="field">日付<input type="date" name="date" required value={data.today} /></label>
					<div class="all-day">
						<span id="all-day-label">終日</span>
						<Switch bind:checked={allDay} name="allDay" labelledby="all-day-label" />
					</div>
					{#if !allDay}
						<div class="times">
							<label class="field">はじまり<input type="time" name="start" /></label>
							<label class="field">終わり<input type="time" name="end" /></label>
						</div>
					{/if}
					<label class="field">場所<input name="place" maxlength="50" autocomplete="off" /></label>
					<label class="field">メモ（任意）<textarea name="memo" rows="3" maxlength="500"></textarea></label>
				{:else}
					<label class="field">休講の日<input type="date" name="date" value={nextClassDay} required /></label>
					<label class="field">
						メモ（任意）
						<input name="body" maxlength="100" autocomplete="off" />
					</label>
				{/if}
				{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
				<div class="form-actions">
					<button class="btn" type="button" onclick={() => (adding = null)}>やめる</button>
					<button class="btn btn-primary" type="submit">追加</button>
				</div>
			</form>
		{/if}

		<div class="lists">
			<section>
				<h2>欠席</h2>
				<div class="item">
					<span class="text">
						<span class="main">{data.absences.length}回{course.absenceLimit ? `（${course.absenceLimit}回まで）` : ''}</span>
						{#if absenceLeft !== null && absenceLeft < 0}
							<span class="sub warn">上限を超えています</span>
						{:else if absenceLeft === 0}
							<span class="sub warn">上限に達しています</span>
						{:else if absenceLeft === 1}
							<span class="sub warn">あと1回で上限です</span>
						{/if}
					</span>
					<form method="POST" action={actionHref('absent', data.termParam)} use:enhance>
						<button class="absent" type="submit" disabled={absentToday}>{absentToday ? '今日は記録ずみ' : '欠席した'}</button>
					</form>
				</div>
				{#each data.absences as a (a.id)}
					<div transition:slide={motion()} class="item">
						<span class="text"><span class="main">{withDay(a.date)}</span></span>
						{@render removeButton(a.id, `${withDay(a.date)}の欠席`, 'removeAbsence')}
					</div>
				{/each}
			</section>

			{#if tasks.length}
				<section>
					<h2>課題</h2>
					{#each tasks as task (task.id)}
						<div transition:slide={motion()} class="item" class:done={task.done}>
							<form method="POST" action={actionHref('done', data.termParam)} use:enhance>
								<input type="hidden" name="id" value={task.id} />
								<input
									class="check"
									type="checkbox"
									name="done"
									checked={task.done}
									aria-label="{task.body}を終わったことにする"
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							</form>
							<span class="text">
								<span class="main">{task.body}</span>
								{#if task.due}<span class="sub">{withDay(task.due)}まで</span>{/if}
							</span>
							{#if task.due && !task.done}
								{@const due = dueLabel(task.due)}
								<span class="due" class:late={due.late}>{due.text}</span>
							{/if}
							{@render removeButton(task.id, `課題「${task.body}」`)}
						</div>
					{/each}
				</section>
			{/if}

			{#if data.events.length}
				<section>
					<h2>イベント</h2>
					{#each data.events as e (e.id)}
						<div transition:slide={motion()} class="item" class:done={e.date < data.today}>
							<span class="text">
								<span class="main">{e.title}</span>
								<span class="sub">{[whenLabel(e), e.place].filter(Boolean).join(' · ')}</span>
								{#if e.memo}<span class="sub memo-line">{e.memo}</span>{/if}
							</span>
							{@render removeButton(e.id, `イベント「${e.title}」`, 'removeEvent')}
						</div>
					{/each}
				</section>
			{/if}

			{#if cancels.length}
				<section>
					<h2>休講</h2>
					{#each cancels as c (c.id)}
						<div transition:slide={motion()} class="item" class:done={(c.date ?? '') < data.today}>
							<span class="text">
								<span class="main">{withDay(c.date ?? '')} 休講</span>
								{#if c.body}<span class="sub">{c.body}</span>{/if}
							</span>
							{@render removeButton(c.id, `${withDay(c.date ?? '')}の休講`)}
						</div>
					{/each}
				</section>
			{/if}

			{#if data.files.length}
				<section>
					<h2>資料</h2>
					<div class="files">
						{#each data.files as file (file.id)}
							{@const badge = fileBadge(file.mime)}
							<div transition:slide={motion()} class="file">
								<a href="/courses/{course.id}/files/{file.id}" target="_blank" rel="noopener">
									<span class="file-icon">
										{#if badge}
											{badge}
										{:else}
											<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
												<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
												<circle cx="9" cy="10" r="1.8" />
												<path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
											</svg>
										{/if}
									</span>
									<span class="text">
										<span class="main">{file.name}</span>
										<span class="sub">
											{formatBytes(file.size)} · {monthDay(tokyoTime(file.createdAt.getTime()).date)}
										</span>
									</span>
								</a>
								{@render removeButton(file.id, `「${file.name}」`, 'removeFile')}
							</div>
						{/each}
					</div>
					<span class="usage">資料の容量 {formatBytes(data.usedBytes)} / {formatBytes(data.quotaBytes)}（全部の授業で）</span>
				</section>
			{/if}

			{#if memos.length}
				<section>
					<h2>メモ</h2>
					{#each memos as memo (memo.id)}
						<div transition:slide={motion()} class="item memo">
							<span class="text">
								{#if memo.date}<span class="sub">{withDay(memo.date)}</span>{/if}
								<span class="body">{memo.body}</span>
							</span>
							{@render removeButton(memo.id, 'このメモ')}
						</div>
					{/each}
				</section>
			{/if}
		</div>

		{#if slotLabels.length > 1}
			<p class="note">
				{slotLabels.map((l) => l.replace(' ', '')).join('・')}の{slotLabels.length === 2 ? 'どちら' : 'どれ'}から開いても、同じ内容が見られます。
			</p>
		{/if}
	</div>
</div>

<style>
	.page {
		min-height: var(--page-h);
		display: flex;
		flex-direction: column;
		background: var(--scrim);
	}

	.scrim {
		height: 52px;
		flex-shrink: 0;
	}

	.sheet {
		flex-grow: 1;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding-bottom: 32px;
		box-sizing: border-box;
		background: var(--bg);
		border-radius: 22px 22px 0 0;
	}

	.grabber {
		display: flex;
		justify-content: center;
		padding: 8px 0 4px;
	}

	.grabber span {
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: var(--line-strong);
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px 16px 14px;
	}

	.title-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	/* Takes the room there is, so the title is wrapped to that and not to its own width */
	.name {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
	}

	.bar {
		width: 14px;
		height: 36px;
		flex-shrink: 0;
		box-sizing: border-box;
		border-radius: 5px;
		border: 1px solid color-mix(in oklab, var(--c), var(--ink) 15%);
		background: var(--c);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 24px;
		min-width: 0;
		flex: 1;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.edit {
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 10px;
		color: var(--ink);
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		padding: 3px 9px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface);
		font-size: 12px;
	}

	.chip.muted {
		border-color: transparent;
		background: var(--slot);
	}

	.synced {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.synced svg {
		stroke-width: 2;
	}

	.teachers {
		font-size: 13px;
		color: var(--ink-soft);
	}

	.shared-link {
		align-self: flex-start;
		font-size: 12px;
	}

	.add-heading,
	section h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.add-heading {
		padding: 0 16px 6px;
	}

	.add-buttons {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 6px;
		padding: 0 16px;
	}

	.add-buttons button {
		height: 68px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 5px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.add-buttons button[aria-pressed='true'] {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--ink);
	}

	.add-buttons button:disabled {
		color: var(--ink-sub);
		cursor: default;
	}

	.file-input {
		display: none;
	}

	.error.block {
		margin: 8px 16px 0;
	}

	.files {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.file {
		display: flex;
		align-items: center;
		padding-right: 4px;
	}

	.file + .file {
		border-top: 1px solid var(--slot);
	}

	.file a {
		flex-grow: 1;
		min-width: 0;
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0 6px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.file-icon {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: var(--slot);
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 700;
	}

	.file form {
		display: contents;
	}

	.usage {
		padding: 0 2px;
		font-size: 11px;
		color: var(--ink-sub);
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 12px 16px 0;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.add-form textarea {
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		line-height: 1.6;
		resize: vertical;
	}

	.add-form .field input {
		background: var(--bg);
	}

	.all-day {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
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

	.add-form :global(textarea) {
		width: 100%;
	}

	.memo-line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.form-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.form-actions .btn {
		min-height: 44px;
	}

	.lists {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px 16px 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.item {
		min-height: 52px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 4px 6px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.item.memo {
		align-items: flex-start;
		padding-top: 10px;
		padding-bottom: 10px;
	}

	.item.done .main {
		color: var(--ink-sub);
		text-decoration: line-through;
	}

	.item form {
		display: contents;
	}

	.check {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		margin: 0;
		accent-color: var(--ink);
	}

	.text {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.main {
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.sub.warn {
		color: var(--accent-text);
		font-weight: 700;
	}

	.absent {
		flex-shrink: 0;
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.absent:disabled {
		color: var(--ink-sub);
		cursor: default;
	}

	.body {
		margin-top: 3px;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.due {
		flex-shrink: 0;
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--course-orange);
		color: var(--now-text);
		font-size: 11px;
		font-weight: 700;
	}

	.due.late {
		background: var(--ink);
		color: var(--surface);
	}

	.remove {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.note {
		margin: 0;
		padding: 14px 16px 0;
		font-size: 11px;
		line-height: 1.6;
		color: var(--ink-sub);
	}
</style>
