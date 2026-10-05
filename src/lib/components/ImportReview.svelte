<script lang="ts">
	// Courses read from a screenshot or a CSV file, checked before they go in the timetable:
	// the terms to add them to, the shared course each may be, what to look at again, and how
	// each compares with what is already there.
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { DAY_NAMES, periodLabel } from '$lib/courses';
	import { splitTeachers } from '$lib/import';
	import { compareCourse, titleDoubt, type Existing } from '$lib/import-review';
	import { normalizeTitle } from '$lib/overlay';

	type Slot = { weekday: number; period: number; span: number; room: string; check?: true; roomCheck?: true };
	type Suggestion = {
		id: string;
		version: number;
		terms: string[];
		score: number;
		title: string;
		slots: { weekday: number; period: number; span: number; room: string | null }[];
	};
	type Group = { title: string; teachers: string[]; credits?: number | null; slots: Slot[]; suggestions: Suggestion[] };

	let {
		terms,
		periods,
		existing,
		defaultTerm,
		canShare,
		groups,
		action,
		message,
		lead
	}: {
		terms: { id: string; name: string }[];
		periods: { number: number }[];
		existing: Existing[];
		defaultTerm: string | null;
		canShare: boolean;
		groups: Group[];
		action: string;
		message?: string;
		lead: string;
	} = $props();

	// Courses already in the chosen terms at a slot a row wants
	function takenBy(slot: Slot, chosen: string[]) {
		for (const c of existing) {
			if (!c.termIds.some((id) => chosen.includes(id))) continue;
			const hit = c.slots.find(
				(t) => t.weekday === slot.weekday && t.period <= slot.period + slot.span - 1 && slot.period <= t.period + t.span - 1
			);
			if (hit) return c.title;
		}
		return undefined;
	}
	const same = (a: string, b: string) => normalizeTitle(a) === normalizeTitle(b);

	// Shared courses of the chosen terms; one that names no term fits any
	function fitting(suggestions: Suggestion[], chosen: string[]) {
		const names = terms.filter((t) => chosen.includes(t.id)).map((t) => t.name);
		return suggestions.filter((s) => !s.terms.length || s.terms.some((n) => names.includes(n)));
	}
	// A same-named course others already added is used as it is
	const autoShared = (suggestions: Suggestion[], chosen: string[]) => {
		const best = fitting(suggestions, chosen)[0];
		return best?.score === 3 ? best.id : null;
	};
	const compare = (g: { title: string; slots: Slot[]; teachers: string; sharedId: string | null }, chosen: string[]) =>
		compareCourse({ title: g.title, slots: g.slots, teachers: splitTeachers(g.teachers), sharedId: g.sharedId }, chosen, existing);
	// Added unless it is already there (the same, or with differences: left as it is unless chosen)
	const kept = (kind: string) => kind === 'new' || kind === 'clash';

	// svelte-ignore state_referenced_locally
	const firstTerms = defaultTerm ? [defaultTerm] : [];
	// svelte-ignore state_referenced_locally
	let rows = $state(
		groups.map((g) => {
			const row = {
				include: true,
				// Set once the person has changed it themselves, so a change of term leaves it alone
				includeSet: false,
				// For a course already there with differences: set it to what was read
				update: false,
				title: g.title,
				teachers: g.teachers.join('、'),
				credits: g.credits ?? null,
				slots: g.slots.map((s): Slot => ({ ...s })),
				sharedId: autoShared(g.suggestions, firstTerms),
				sharedSet: false,
				suggestions: g.suggestions
			};
			row.include = kept(compare(row, firstTerms).kind);
			return row;
		})
	);
	let termIds = $state<string[]>([...firstTerms]);

	// Choosing other terms: what is already there, and which shared courses fit, are those of the new terms
	function termsChanged() {
		rows.forEach((row) => {
			if (!row.sharedSet) row.sharedId = autoShared(row.suggestions, termIds);
			else if (row.sharedId && !fitting(row.suggestions, termIds).some((s) => s.id === row.sharedId)) row.sharedId = null;
			if (!row.includeSet) {
				row.include = kept(compare(row, termIds).kind);
				row.update = false;
			}
		});
	}
	let sync = $state(true);
	let saving = $state(false);

	const periodNumbers = $derived(periods.map((p) => p.number));
	const comparisons = $derived(rows.map((r) => compare(r, termIds)));
	// The course to set to what was read, when that is chosen and allowed
	const updateOf = (i: number) => {
		const c = comparisons[i];
		return rows[i].update && !rows[i].sharedId && c?.kind === 'changed' && !c.course.synced ? c.course.id : null;
	};
	const included = $derived(rows.filter((r, i) => r.include || updateOf(i)));

	// What was read has to be one of this timetable's periods, with room for the span.
	function fits(s: Slot) {
		const start = periodNumbers.indexOf(s.period);
		return start >= 0 && start + s.span <= periodNumbers.length;
	}
	const unfit = $derived(included.some((r) => !r.sharedId && r.slots.some((s) => !fits(s))));

	// Parts worth a second look, counted for the note at the top
	const titleDoubtOf = (r: (typeof rows)[number]) => !r.sharedId && titleDoubt(r.title);
	const doubts = $derived(
		rows.reduce(
			(n, r) => n + (r.sharedId ? 0 : Number(titleDoubtOf(r)) + r.slots.filter((s) => s.check || s.roomCheck).length),
			0
		)
	);

	const payload = $derived(
		JSON.stringify(
			rows.flatMap((r, i) =>
				r.include || updateOf(i)
					? [
							{
								title: r.title.trim(),
								teachers: splitTeachers(r.teachers),
								slots: r.slots,
								credits: r.credits,
								sharedId: r.sharedId,
								updateId: updateOf(i)
							}
						]
					: []
			)
		)
	);
	const adding = $derived(rows.filter((r, i) => r.include && !updateOf(i)).length);
	const updating = $derived(rows.filter((_, i) => updateOf(i)).length);
	const buttonLabel = $derived(
		[adding ? `${adding}件を追加` : '', updating ? `${updating}件を直す` : ''].filter(Boolean).join('・') || '追加する授業を選んでください'
	);

	const slotText = (s: { weekday: number; period: number; span: number; room: string | null }) =>
		`${DAY_NAMES[s.weekday]}${periodLabel(s.period, s.span, periodNumbers)}${s.room ? ` ${s.room}` : ''}`;

	// Picking 今のまま / 直す, or 追加しない / 並べて入れる
	function choose(i: number, value: 'keep' | 'update' | 'skip' | 'add') {
		const row = rows[i];
		row.includeSet = true;
		row.update = value === 'update';
		row.include = value === 'add';
	}
</script>

<form
	class="body"
	method="POST"
	{action}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update();
			saving = false;
		};
	}}
>
	<p class="warn">
		<Icon name="flag" size={18} />
		<span>{lead}</span>
	</p>

	<fieldset class="terms">
		<legend>追加する学期</legend>
		<div class="term-chips">
			{#each terms as t (t.id)}
				<label class="chip" class:on={termIds.includes(t.id)}>
					<input type="checkbox" name="term" value={t.id} bind:group={termIds} onchange={termsChanged} />
					{t.name}
				</label>
			{/each}
		</div>
	</fieldset>

	{#if canShare}
		<div class="ui-list">
			<div class="ui-row">
				<span id="sync-label">みんなと同期する</span>
				<Switch bind:checked={sync} labelledby="sync-label" name="sync" />
			</div>
		</div>
		<p class="ui-note">
			同期すると、同じ大学の人が「授業をさがす」で選べるようになります。「みんなの登録」に合わせた授業はいつも同期します。
		</p>
	{/if}

	<h2 class="count">{rows.length}件の授業（{adding}件を追加{updating ? `・${updating}件を直す` : ''}）</h2>
	{#if doubts}
		<p class="doubts" role="status"><Icon name="flag" size={16} />確かめてほしい所が{doubts}か所あります。枠で囲んだ所を見てください。</p>
	{/if}
	{#each rows as row, i (i)}
		{@const cmp = comparisons[i]}
		<div class="course" class:off={!row.include && !updateOf(i)}>
			<div class="head">
				{#if cmp?.kind === 'new' || cmp?.kind === 'same'}
					<input class="check" type="checkbox" bind:checked={row.include} onchange={() => (row.includeSet = true)} aria-label="{row.title}を追加する" />
				{/if}
				{#if row.sharedId}
					{@const s = row.suggestions.find((x) => x.id === row.sharedId)}
					<span class="title-fixed">{s?.title}</span>
				{:else}
					<input class="title" class:doubt={titleDoubtOf(row)} bind:value={row.title} maxlength="60" aria-label="授業名" />
				{/if}
				<span class="badge" class:changed={cmp?.kind === 'changed' || cmp?.kind === 'clash'}>
					{cmp?.kind === 'new' ? '新しい' : cmp?.kind === 'same' ? '同じ' : cmp?.kind === 'changed' ? '違いあり' : '時間が重なる'}
				</span>
			</div>
			{#if titleDoubtOf(row)}
				<p class="taken">授業名がうまく読めていないかもしれません</p>
			{/if}

			{#if cmp?.kind === 'same'}
				<p class="note">すでに時間割にあります。</p>
			{:else if cmp?.kind === 'changed'}
				<div class="diff">
					<p class="note">時間割にある「{cmp.course.title}」と{cmp.diffs.join('・')}が違います。</p>
					<p class="note">今：{cmp.course.slots.map(slotText).join('・') || '曜日・時限なし'}{cmp.course.teachers.length ? `（${cmp.course.teachers.join('、')}）` : ''}</p>
					{#if cmp.course.synced}
						<p class="note">みんなの登録に同期している授業なので、ここでは直しません。授業の画面から直してください。</p>
					{:else if !row.sharedId}
						<div class="suggest" role="radiogroup" aria-label="{row.title}をどうするか">
							<label class="option">
								<input type="radio" name="diff-{i}" checked={!row.update && !row.include} onchange={() => choose(i, 'keep')} />
								<span>今のまま</span>
							</label>
							<label class="option">
								<input type="radio" name="diff-{i}" checked={row.update} onchange={() => choose(i, 'update')} />
								<span>読み取った内容に直す</span>
							</label>
						</div>
					{/if}
				</div>
			{:else if cmp?.kind === 'clash'}
				<div class="suggest" role="radiogroup" aria-label="{row.title}をどうするか">
					<p class="note">同じ時間に「{cmp.titles.join('」「')}」があります。今の授業は消えません。</p>
					<label class="option">
						<input type="radio" name="clash-{i}" checked={!row.include} onchange={() => choose(i, 'skip')} />
						<span>追加しない</span>
					</label>
					<label class="option">
						<input type="radio" name="clash-{i}" checked={row.include} onchange={() => choose(i, 'add')} />
						<span>並べて入れる</span>
					</label>
				</div>
			{/if}

			{#if fitting(row.suggestions, termIds).length && !row.update}
				<div class="suggest" role="radiogroup" aria-label="{row.title}の登録のしかた">
					{#each fitting(row.suggestions, termIds) as s (s.id)}
						<label class="option">
							<input type="radio" name="shared-{i}" checked={row.sharedId === s.id} onchange={() => ((row.sharedId = s.id), (row.sharedSet = true))} />
							<span>みんなの登録「{s.title}」に合わせる<small>{s.slots.map(slotText).join('・')}</small></span>
						</label>
					{/each}
					<label class="option">
						<input type="radio" name="shared-{i}" checked={row.sharedId === null} onchange={() => ((row.sharedId = null), (row.sharedSet = true))} />
						<span>読み取った内容で登録する</span>
					</label>
				</div>
			{/if}

			{#if !row.sharedId}
				{#each row.slots as slot, j (j)}
					<div class="slot">
						<select bind:value={slot.weekday} aria-label="曜日" class:doubt={slot.check}>
							{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAY_NAMES[d]}</option>{/each}
						</select>
						<select bind:value={slot.period} aria-label="時限">
							{#if !periodNumbers.includes(slot.period)}<option value={slot.period}>{slot.period}限</option>{/if}
							{#each periods as p (p.number)}<option value={p.number}>{p.number}限</option>{/each}
						</select>
						<select bind:value={slot.span} aria-label="コマ数">
							{#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}コマ</option>{/each}
						</select>
						<input bind:value={slot.room} maxlength="20" placeholder="教室" aria-label="教室" class:doubt={slot.roomCheck} />
						{#if row.slots.length > 1}
							<button type="button" class="remove" aria-label="この曜日・時限を消す" onclick={() => row.slots.splice(j, 1)}>
								<Icon name="close" size={16} />
							</button>
						{/if}
					</div>
					{@const taken = takenBy(slot, termIds)}
					{#if slot.check}
						<p class="taken">曜日の見出しとマスの数が合わない行から読み取りました。曜日を確かめてください</p>
					{/if}
					{#if slot.roomCheck}
						<p class="taken">続きのコマで教室がちがって読めました。教室を確かめてください</p>
					{/if}
					{#if !fits(slot)}
						<p class="taken">この時間割にない時限です。時限かコマ数を選び直してください</p>
					{:else if taken && !same(taken, row.title) && cmp?.kind !== 'clash'}
						<p class="taken">この時間には「{taken}」が入っています</p>
					{/if}
				{/each}
				<input class="teachers" bind:value={row.teachers} maxlength="200" placeholder="先生（任意・複数は「、」で区切る）" aria-label="先生" />
			{/if}
		</div>
	{/each}

	<input type="hidden" name="rows" value={payload} />
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	<button class="btn btn-primary" type="submit" disabled={saving || !included.length || (adding > 0 && !termIds.length) || unfit}>
		{saving ? '保存中…' : buttonLabel}
	</button>
</form>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}


	.warn {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--course-orange);
		color: var(--now-text);
		font-size: 13px;
		line-height: 1.6;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 6px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.term-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		padding: 0 14px;
		border: 1px solid var(--line-strong);
		border-radius: 18px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.chip.on {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.chip:has(input:focus-visible) {
		outline: 2px solid var(--accent-text);
		outline-offset: 2px;
	}

	.count {
		margin: 4px 0 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.course {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.course.off {
		opacity: 0.55;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.check {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		margin: 0;
		accent-color: var(--ink);
	}

	input,
	select {
		height: 40px;
		box-sizing: border-box;
		min-width: 0;
		padding: 0 8px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.check,
	.option input,
	.chip input {
		height: auto;
	}

	.title {
		flex-grow: 1;
		font-weight: 700;
	}

	.title-fixed {
		font-size: 16px;
		font-weight: 700;
	}

	.suggest {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option {
		min-height: 40px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}

	.option input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--ink);
	}

	.option span {
		display: flex;
		flex-direction: column;
	}

	.option small {
		font-size: 11px;
		color: var(--ink-sub);
	}

	.slot {
		display: grid;
		grid-template-columns: 52px 64px 72px minmax(0, 1fr) auto;
		gap: 6px;
		align-items: center;
	}

	.remove {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.taken {
		margin: -2px 0 0;
		font-size: 12px;
		color: var(--accent-text);
	}

	.teachers {
		width: 100%;
	}



	.doubts {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--now-text);
	}

	.doubt {
		outline: 2px solid var(--shu);
		outline-offset: 1px;
	}

	.badge {
		flex-shrink: 0;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--line);
		color: var(--ink-sub);
		font-size: 11px;
		font-weight: 700;
	}

	.badge.changed {
		background: var(--course-orange);
		color: var(--now-text);
	}

	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-soft);
	}

	.diff {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
