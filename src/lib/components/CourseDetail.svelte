<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { motion, still } from '$lib/motion';
	import StepsField from '$lib/components/StepsField.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { swipeDown } from '$lib/swipe';
	import { wrapTitle } from '$lib/wrap-title';
	import {
		DAY_NAMES,
		absenceLimitOf,
		actionHref,
		classTimeOn,
		courseColor,
		courseHref,
		creditsOf,
		deliveryLabel,
		periodLabel,
		timetableHref,
		weekLabel
	} from '$lib/courses';
	import { FILE_ACCEPT, fileBadge, formatBytes, uploadFile } from '$lib/files';
	import { moveId, orderMemos } from '$lib/notes';
	import { votesLabel } from '$lib/cancellations';
	import { whenLabel } from '$lib/plans';
	import { REPEAT_MAX, stepsDone, submitLink, type TaskStep } from '$lib/tasks';
	import { addDays, daysBetween, monthDay, tokyoTime, weekdayOf } from '$lib/time';
	import type { ActionData, PageData } from '../../routes/courses/[id]/$types';

	// A course's page. It is the page of /courses/[id], and also opens over the timetable without
	// leaving it (see the home page): then `close` and `refresh` are given, since the timetable
	// stays where it was and this is only shown on top of it.
	let {
		data,
		form,
		close,
		refresh
	}: { data: PageData; form?: ActionData; close?: () => unknown; refresh?: () => unknown } = $props();

	// After a form is answered. Over the timetable, everything is not loaded again (the address
	// is the course's own page, which is where that would take us): the course is read again.
	type Update = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	async function settle(update: Update, options: { reset?: boolean } = {}) {
		await update({ ...options, invalidateAll: !refresh });
		await refresh?.();
	}

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

	let adding = $state<'memo' | 'task' | 'cancel' | 'event' | 'move' | null>(null);
	let allDay = $state(false);
	// The event's own date and times, which "授業の時間にする" fills in
	let evDate = $state('');
	let evStart = $state('');
	let evEnd = $state('');
	let evClass = $state(false);
	let evExam = $state(false);
	const classTime = $derived(classTimeOn(evDate, course.slots, data.periods));

	function openEvent() {
		if (adding === 'event') return (adding = null);
		allDay = false;
		evClass = false;
		evExam = false;
		evDate = data.today;
		evStart = '';
		evEnd = '';
		adding = 'event';
	}

	// While it is on, the times follow the class on that day; editing them by hand is still fine
	$effect(() => {
		if (!evClass) return;
		if (classTime) {
			evStart = classTime.start;
			evEnd = classTime.end;
		} else {
			evClass = false;
		}
	});

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
	const moves = $derived(data.moves.toSorted((a, b) => a.fromDate.localeCompare(b.fromDate)));
	const memos = $derived(orderMemos(data.notes.filter((n) => n.kind === 'memo')));

	// Weekly homework: until the end of the course's last term, unless changed
	let repeat = $state(false);
	const termEnd = $derived(
		data.terms
			.filter((t) => course.termIds.includes(t.id) && t.endDate)
			.map((t) => t.endDate ?? '')
			.sort()
			.at(-1)
	);
	// Homework whose steps are open, and the weekly one being deleted (asking which copies)
	let opened = $state<string[]>([]);
	// Up to five homework at first; weekly ones can make a long list
	const TASKS_SHOWN = 5;
	let allTasks = $state(false);
	let removing = $state<string | null>(null);

	// The note being changed (its form is where the note was)
	let editing = $state<string | null>(null);
	// Putting the memos in an order: the ids as they are lined up until 完了
	let sorting = $state(false);
	let draft = $state<string[]>([]);
	const lined = $derived.by(() => {
		const byId = new Map(memos.map((m) => [m.id, m]));
		const inDraft = draft.flatMap((id) => byId.get(id) ?? []);
		// A memo that came after the list was lined up (from another screen) goes on top
		return [...memos.filter((m) => !draft.includes(m.id)), ...inDraft];
	});
	const shown = $derived(sorting ? lined : memos);
	function startSorting() {
		editing = null;
		adding = null;
		draft = memos.map((m) => m.id);
		sorting = true;
	}

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
		if (refresh) await refresh();
		else await invalidateAll();
		uploading = false;
	}

	// Absences: recorded by date, one a day
	const absentToday = $derived(data.absences.some((a) => a.date === data.today));
	const credits = $derived(creditsOf(course, data.timetable.universityId));
	const absenceLimit = $derived(absenceLimitOf(course, data.timetable.universityId));
	const absenceLeft = $derived(absenceLimit ? absenceLimit - data.absences.length : null);

	function dueLabel(due: string) {
		const days = daysBetween(data.today, due);
		if (days > 0) return { text: `あと${days}日`, late: false };
		if (days === 0) return { text: '今日まで', late: false };
		return { text: `${-days}日過ぎ`, late: true };
	}
</script>

{#snippet noteFields(kind: 'memo' | 'task' | 'cancel', note?: { date: string | null; body: string; due: string | null; dueTime?: string | null; submitTo?: string | null; steps?: TaskStep[] | null })}
	{#if kind === 'memo'}
		<label class="field">日付<input type="date" name="date" value={note?.date ?? data.today} required /></label>
		<label class="field">メモ<textarea name="body" rows="4" maxlength="1000" required>{note?.body ?? ''}</textarea></label>
	{:else if kind === 'task'}
		<label class="field">課題<input name="body" value={note?.body ?? ''} maxlength="100" required autocomplete="off" /></label>
		<div class="times">
			<label class="field">締切（任意）<input type="date" name="due" value={note?.due ?? ''} /></label>
			<label class="field">時刻（任意）<input type="time" name="dueTime" value={note?.dueTime ?? ''} /></label>
		</div>
		<label class="field">
			提出先（任意）
			<input name="submitTo" value={note?.submitTo ?? ''} maxlength="200" autocomplete="off" placeholder="URL や「レポートボックス」など" />
		</label>
		<StepsField steps={note?.steps} />
		{#if !note}
			<div class="all-day">
				<span id="repeat-label">毎週くり返す</span>
				<Switch bind:checked={repeat} name="repeat" labelledby="repeat-label" />
			</div>
			{#if repeat}
				<label class="field">
					最後の日
					<input type="date" name="until" value={termEnd ?? ''} required />
				</label>
				<p class="hint">締切の日から毎週、{REPEAT_MAX}回まで作ります。</p>
			{/if}
		{/if}
	{:else}
		<label class="field">休講の日<input type="date" name="date" value={note?.date ?? nextClassDay} required /></label>
		<label class="field">
			メモ（任意）
			<input name="body" value={note?.body ?? ''} maxlength="100" autocomplete="off" />
		</label>
	{/if}
{/snippet}

{#snippet editButton(id: string, label: string)}
	<button class="remove" type="button" aria-label="{label}を直す" onclick={() => (editing = id)}>
		<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5zM14.5 6.5l3 3" /></svg>
	</button>
{/snippet}

{#snippet editForm(note: { id: string; kind: 'memo' | 'task' | 'cancel'; date: string | null; body: string; due: string | null; dueTime?: string | null; submitTo?: string | null; steps?: TaskStep[] | null })}
	<form
		class="add-form inline"
		method="POST"
		action={actionHref('edit', data.termParam)}
		use:enhance={() =>
			async ({ result, update }) => {
				await settle(update);
				if (result.type === 'success') editing = null;
			}}
	>
		<input type="hidden" name="id" value={note.id} />
		<input type="hidden" name="kind" value={note.kind} />
		{@render noteFields(note.kind, note)}
		{#if form?.message && form.editing === note.id}<p class="error" role="alert">{form.message}</p>{/if}
		<div class="form-actions">
			<button class="btn" type="button" onclick={() => (editing = null)}>やめる</button>
			<button class="btn btn-primary" type="submit">保存</button>
		</div>
	</form>
{/snippet}

{#snippet removeButton(id: string, label: string, action = 'remove')}
	<form
		method="POST"
		action={actionHref(action, data.termParam)}
		use:enhance={({ cancel }) => {
			if (!confirm(`${label}を消します`)) cancel();
			return ({ update }) => settle(update);
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button class="remove" type="submit" aria-label="{label}を消す">
			<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</form>
{/snippet}

<div class="page" class:over={!!close}>
	<a
		class="scrim"
		href={timetableHref(data.termParam)}
		aria-label="閉じて時間割にもどる"
		onclick={(e) => {
			if (!close) return;
			e.preventDefault();
			close();
		}}
	></a>

	<!-- Over the timetable it slides up and down itself (a page change is animated by the browser, see app.css) -->
	<div
		class="sheet course-sheet"
		in:fly|global={{ y: '100%', duration: close && !still() ? 300 : 0, opacity: 1 }}
		out:fly|global={{ y: '100%', duration: close && !still() ? 240 : 0, opacity: 1 }}
		use:swipeDown={() => (close ? close() : goto(timetableHref(data.termParam)))}
	>
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
				{#if credits}<span class="chip muted">{credits}単位</span>{/if}
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
			<button type="button" aria-pressed={adding === 'move'} onclick={() => (adding = adding === 'move' ? null : 'move')}>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
				</svg>
				振替
			</button>
			<button type="button" aria-pressed={adding === 'event'} onclick={openEvent}>
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
		{#if form?.message && !adding && !form.editing}<p class="error block" role="alert">{form.message}</p>{/if}

		{#if adding}
			<form
				class="add-form"
				method="POST"
				action={actionHref(adding === 'event' || adding === 'move' ? adding : 'note', data.termParam)}
				use:enhance={() =>
					async ({ result, update }) => {
						await settle(update);
						if (result.type === 'success') adding = null;
					}}
			>
				{#if adding !== 'event' && adding !== 'move'}<input type="hidden" name="kind" value={adding} />{/if}
				{#if adding === 'move'}
					<label class="field">もとの日<input type="date" name="from" value={nextClassDay} required /></label>
					<label class="field">振替の日<input type="date" name="to" required /></label>
					<div class="times">
						<label class="field">
							時限
							<select name="period" required value={course.slots[0]?.period ?? data.periods[0]?.number}>
								{#each data.periods as p (p.number)}<option value={p.number}>{p.number}限</option>{/each}
							</select>
						</label>
						<label class="field">
							コマ数
							<select name="span" value={course.slots[0]?.span ?? 1}>
								{#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}コマ</option>{/each}
							</select>
						</label>
					</div>
					<label class="field">教室（任意）<input name="room" maxlength="50" autocomplete="off" value={course.slots[0]?.room ?? ''} /></label>
				{:else if adding === 'event'}
					<label class="field">名前<input name="title" maxlength="100" required autocomplete="off" placeholder="期末試験" /></label>
					<label class="field">日付<input type="date" name="date" required bind:value={evDate} /></label>
					<div class="all-day">
						<span id="all-day-label">終日</span>
						<Switch bind:checked={allDay} name="allDay" labelledby="all-day-label" onchange={() => (evClass = false)} />
					</div>
					{#if !allDay}
						<div class="all-day">
							<span id="class-time-label">
								授業の時間にする
								{#if !classTime}<span class="sub">この日は授業がありません</span>{/if}
							</span>
							<Switch
								bind:checked={evClass}
								labelledby="class-time-label"
								disabled={!classTime}
							/>
						</div>
						<div class="times">
							<label class="field">はじまり<input type="time" name="start" bind:value={evStart} /></label>
							<label class="field">終わり<input type="time" name="end" bind:value={evEnd} /></label>
						</div>
					{/if}
					<label class="field">場所<input name="place" maxlength="50" autocomplete="off" /></label>
					<div class="all-day">
						<span id="exam-label">試験</span>
						<Switch bind:checked={evExam} name="exam" labelledby="exam-label" />
					</div>
					{#if evExam}
						<label class="field">範囲（任意）<textarea name="scope" rows="2" maxlength="500"></textarea></label>
						<label class="field">持ち物（任意）<textarea name="bring" rows="2" maxlength="500"></textarea></label>
					{/if}
					<label class="field">メモ（任意）<textarea name="memo" rows="3" maxlength="500"></textarea></label>
				{:else}
					{@render noteFields(adding)}
				{/if}
				{#if form?.message && !form.editing}<p class="error" role="alert">{form.message}</p>{/if}
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
						<span class="main">{data.absences.length}回{absenceLimit ? `（${absenceLimit}回まで）` : ''}</span>
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
					{#each allTasks ? tasks : tasks.slice(0, TASKS_SHOWN) as task (task.id)}
						{#if editing === task.id}
							{@render editForm(task)}
						{:else}
						{@const link = submitLink(task.submitTo)}
						{@const progress = stepsDone(task.steps)}
						<div transition:slide={motion()} class="item" class:done={task.done}>
							<form
								method="POST"
								action={actionHref('done', data.termParam)}
								use:enhance={() => ({ update }) => settle(update)}
							>
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
								{#if task.due}<span class="sub">{withDay(task.due)}{task.dueTime ? ` ${task.dueTime.replace(/^0/, '')}` : ''}まで</span>{/if}
								{#if link}
									<a class="sub submit" href={link.href} target="_blank" rel="noopener noreferrer">提出先：{link.host}</a>
								{:else if task.submitTo}
									<span class="sub">提出先：{task.submitTo}</span>
								{/if}
								{#if progress}
									<button
										class="steps-toggle"
										type="button"
										aria-expanded={opened.includes(task.id)}
										onclick={() => (opened = opened.includes(task.id) ? opened.filter((id) => id !== task.id) : [...opened, task.id])}
									>
										チェック {progress}
									</button>
								{/if}
							</span>
							{#if task.due && !task.done}
								{@const due = dueLabel(task.due)}
								<span class="due" class:late={due.late}>{due.text}</span>
							{/if}
							{@render editButton(task.id, `課題「${task.body}」`)}
							{#if task.seriesId}
								<button class="remove" type="button" aria-label="課題「{task.body}」を消す" onclick={() => (removing = removing === task.id ? null : task.id)}>
									<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
								</button>
							{:else}
								{@render removeButton(task.id, `課題「${task.body}」`)}
							{/if}
						</div>
						{#if removing === task.id}
							<form
								class="series-remove"
								method="POST"
								action={actionHref('remove', data.termParam)}
								use:enhance={() =>
									async ({ update }) => {
										removing = null;
										await settle(update);
									}}
							>
								<input type="hidden" name="id" value={task.id} />
								<span>くり返しの課題です。どれを消しますか？</span>
								<div class="series-actions">
									<button class="btn" type="submit">この回だけ</button>
									<button class="btn" type="submit" name="later" value="on">これ以降ぜんぶ</button>
									<button class="btn" type="button" onclick={() => (removing = null)}>やめる</button>
								</div>
							</form>
						{/if}
						{#if progress && opened.includes(task.id)}
							<div class="steps" transition:slide={motion()}>
								{#each task.steps ?? [] as step, i (i)}
									<form method="POST" action={actionHref('step', data.termParam)} use:enhance={() => ({ update }) => settle(update)}>
										<input type="hidden" name="id" value={task.id} />
										<input type="hidden" name="index" value={i} />
										<label class="step" class:done={step.done}>
											<input
												class="check"
												type="checkbox"
												name="done"
												checked={step.done}
												onchange={(e) => e.currentTarget.form?.requestSubmit()}
											/>
											<span>{step.text}</span>
										</label>
									</form>
								{/each}
							</div>
						{/if}
						{/if}
					{/each}
					{#if !allTasks && tasks.length > TASKS_SHOWN}
						<button class="more-tasks" type="button" onclick={() => (allTasks = true)}>さらに表示（あと{tasks.length - TASKS_SHOWN}件）</button>
					{/if}
				</section>
			{/if}

			{#if data.events.length}
				<section>
					<h2>イベント</h2>
					{#each data.events as e (e.id)}
						<div transition:slide={motion()} class="item" class:done={e.date < data.today}>
							<span class="text">
								<span class="main">{#if e.exam}<b class="exam-tag">試験</b>{/if}{e.title}</span>
								<span class="sub">{[whenLabel(e), e.place].filter(Boolean).join(' · ')}</span>
								{#if e.scope}<span class="sub memo-line">範囲：{e.scope}</span>{/if}
								{#if e.bring}<span class="sub memo-line">持ち物：{e.bring}</span>{/if}
								{#if e.memo}<span class="sub memo-line">{e.memo}</span>{/if}
							</span>
							{@render removeButton(e.id, `イベント「${e.title}」`, 'removeEvent')}
						</div>
					{/each}
				</section>
			{/if}

			{#if data.sharedCancels.length}
				<section>
					<h2>みんなの休講</h2>
					{#each data.sharedCancels as c (c.date)}
						<div transition:slide={motion()} class="item">
							<span class="text">
								<span class="main">{withDay(c.date)}</span>
								<span class="sub">{votesLabel(c.n)}</span>
							</span>
							<form method="POST" action={actionHref('adoptCancel', data.termParam)} use:enhance>
								<input type="hidden" name="date" value={c.date} />
								<button class="absent" type="submit">休講にする</button>
							</form>
							<form
								method="POST"
								action={actionHref('reportCancel', data.termParam)}
								use:enhance={({ cancel }) => {
									if (!confirm(`${withDay(c.date)}の休講は、まちがいかいたずらだと運営に伝えます`)) cancel();
								}}
							>
								<input type="hidden" name="date" value={c.date} />
								<button class="absent quiet" type="submit" disabled={c.reported}>{c.reported ? '報告ずみ' : 'まちがい'}</button>
							</form>
						</div>
					{/each}
				</section>
			{/if}

			{#if moves.length}
				<section>
					<h2>振替</h2>
					{#each moves as m (m.id)}
						<div transition:slide={motion()} class="item" class:done={m.toDate < data.today && m.fromDate < data.today}>
							<span class="text">
								<span class="main">{withDay(m.fromDate)} → {withDay(m.toDate)} {periodLabel(m.period, m.span, periodNumbers)}</span>
								{#if m.room}<span class="sub">{m.room}</span>{/if}
							</span>
							{@render removeButton(m.id, `${withDay(m.fromDate)}の振替`, 'removeMove')}
						</div>
					{/each}
				</section>
			{/if}

			{#if cancels.length}
				<section>
					<h2>休講</h2>
					{#each cancels as c (c.id)}
						{#if editing === c.id}
							{@render editForm(c)}
						{:else}
						<div transition:slide={motion()} class="item" class:done={(c.date ?? '') < data.today}>
							<span class="text">
								<span class="main">{withDay(c.date ?? '')} 休講</span>
								{#if c.body}<span class="sub">{c.body}</span>{/if}
							</span>
							{@render editButton(c.id, `${withDay(c.date ?? '')}の休講`)}
							{@render removeButton(c.id, `${withDay(c.date ?? '')}の休講`)}
						</div>
						{/if}
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
					<div class="heading">
						<h2>メモ</h2>
						{#if sorting}
							<form
								method="POST"
								action={actionHref('order', data.termParam)}
								use:enhance={({ cancel }) => {
									// Left as it was: nothing to save
									if (lined.every((m, i) => m.id === memos[i].id)) {
										cancel();
										sorting = false;
										return;
									}
									return async ({ update }) => {
										await settle(update);
										sorting = false;
									};
								}}
							>
								{#each lined as m (m.id)}<input type="hidden" name="id" value={m.id} />{/each}
								<button class="link" type="submit">完了</button>
							</form>
						{:else if memos.length > 1}
							<button class="link" type="button" onclick={startSorting}>並び替え</button>
						{/if}
					</div>
					{#each shown as memo (memo.id)}
						<div class="row" animate:flip={motion(200)} transition:slide={motion()}>
						{#if editing === memo.id}
							{@render editForm(memo)}
						{:else}
							<div class="item memo">
								<span class="text">
									{#if memo.date}<span class="sub">{withDay(memo.date)}</span>{/if}
									<span class="body">{memo.body}</span>
								</span>
								{#if sorting}
									{@const at = lined.indexOf(memo)}
									<span class="arrows">
										<button
											class="remove"
											type="button"
											disabled={at === 0}
											aria-label="このメモを上へ"
											onclick={() => (draft = moveId(lined.map((m) => m.id), memo.id, -1))}
										>
											<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6" /></svg>
										</button>
										<button
											class="remove"
											type="button"
											disabled={at === lined.length - 1}
											aria-label="このメモを下へ"
											onclick={() => (draft = moveId(lined.map((m) => m.id), memo.id, 1))}
										>
											<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
										</button>
									</span>
								{:else}
									{@render editButton(memo.id, 'このメモ')}
									{@render removeButton(memo.id, 'このメモ')}
								{/if}
							</div>
						{/if}
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

	/* Over the timetable, whose dimmed view is behind it (the box around it is the backdrop) */
	.page.over {
		background: none;
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
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 5px;
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
		font-size: 11px;
		font-weight: 700;
		letter-spacing: -0.04em;
		white-space: nowrap;
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

	.all-day .sub {
		display: block;
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

	.exam-tag {
		margin-right: 6px;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--shu);
		color: #fff;
		font-size: 11px;
	}

	.more-tasks {
		height: 40px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}

	.hint {
		margin: -4px 0 0;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.submit {
		color: var(--ink-sub);
		text-decoration: underline;
		overflow-wrap: anywhere;
	}

	.steps-toggle {
		align-self: flex-start;
		padding: 2px 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 0 8px 40px;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		font-size: 14px;
	}

	.step.done span {
		color: var(--ink-sub);
		text-decoration: line-through;
	}

	.series-remove {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 0;
		font-size: 13px;
	}

	.series-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.series-actions .btn {
		flex: 1 1 auto;
		height: 40px;
		font-size: 13px;
	}

	.add-form select {
		box-sizing: border-box;
		width: 100%;
		height: 48px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
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

	.absent.quiet {
		border-color: transparent;
		background: transparent;
		color: var(--ink-sub);
		font-weight: 400;
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

	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.heading form {
		display: block;
	}

	.link {
		height: 32px;
		padding: 0 4px;
		border: none;
		background: none;
		color: var(--accent-text);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.arrows {
		flex-shrink: 0;
		display: flex;
	}

	.arrows .remove:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.add-form.inline {
		margin: 0;
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
