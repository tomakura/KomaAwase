<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import { DAY_NAMES, periodLabel } from '$lib/courses';
	import { splitTeachers } from '$lib/import';
	import { normalizeTitle } from '$lib/overlay';

	let { data, form } = $props();

	type Slot = { weekday: number; period: number; span: number; room: string; check?: true };

	// Courses already in the chosen terms at a slot a row wants
	function takenBy(slot: Slot, terms: string[]) {
		return data.taken.find(
			(t) =>
				t.weekday === slot.weekday &&
				t.termIds.some((id) => terms.includes(id)) &&
				t.period <= slot.period + slot.span - 1 &&
				slot.period <= t.period + t.span - 1
		)?.title;
	}
	const same = (a: string, b: string) => normalizeTitle(a) === normalizeTitle(b);

	// svelte-ignore state_referenced_locally
	const firstTerms = data.defaultTerm ? [data.defaultTerm] : [];
	// svelte-ignore state_referenced_locally
	let rows = $state(
		data.groups.map((g) => ({
			// Already in the timetable under the same name: left out unless picked
			include: !g.slots.every((s) => {
				const title = takenBy({ ...s, room: s.room }, firstTerms);
				return title && same(title, g.title);
			}),
			title: g.title,
			teachers: g.teachers.join('、'),
			slots: g.slots.map((s): Slot => ({ ...s })),
			// A same-named course others already added is used as it is
			sharedId: g.suggestions[0]?.score === 3 ? g.suggestions[0].id : null,
			suggestions: g.suggestions
		}))
	);
	let termIds = $state<string[]>([...firstTerms]);
	let sync = $state(true);
	let saving = $state(false);

	const periodNumbers = $derived(data.periods.map((p) => p.number));
	const included = $derived(rows.filter((r) => r.include));

	// What was read has to be one of this timetable's periods, with room for the span.
	function fits(s: Slot) {
		const start = periodNumbers.indexOf(s.period);
		return start >= 0 && start + s.span <= periodNumbers.length;
	}
	const unfit = $derived(included.some((r) => !r.sharedId && r.slots.some((s) => !fits(s))));

	const payload = $derived(
		JSON.stringify(
			included.map((r) => ({
				title: r.title.trim(),
				teachers: splitTeachers(r.teachers),
				slots: r.slots,
				sharedId: r.sharedId
			}))
		)
	);

	const slotText = (s: { weekday: number; period: number; span: number; room: string | null }) =>
		`${DAY_NAMES[s.weekday]}${periodLabel(s.period, s.span, periodNumbers)}${s.room ? ` ${s.room}` : ''}`;
</script>

<svelte:head>
	<title>読み取った授業 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="読み取った授業" back="/import" />

	{#if data.job.status !== 'done' || data.job.closed}
		<div class="body">
			<p class="lead">
				{data.job.closed
					? 'この読み込みは終わっています。'
					: '画像から授業を読み取れませんでした。時間割の部分だけを切り抜くと、読み取れることがあります。'}
			</p>
			<a class="btn btn-primary" href="/import">もう一度読み込む</a>
			<a class="btn" href="/courses/new">自分で入力する</a>
			{#if !data.job.closed}
				<form method="POST" action="?/dismiss" use:enhance><button class="link" type="submit">この読み込みを閉じる</button></form>
			{/if}
		</div>
	{:else}
		<form
			class="body"
			method="POST"
			action="?/save"
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
				<span>AIが読み取った内容です。授業名・曜日・時限・教室がまちがっていないか、保存する前に見直してください。</span>
			</p>

			<fieldset class="terms">
				<legend>追加する学期</legend>
				<div class="term-chips">
					{#each data.terms as t (t.id)}
						<label class="chip" class:on={termIds.includes(t.id)}>
							<input type="checkbox" name="term" value={t.id} bind:group={termIds} />
							{t.name}
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="ui-list">
				<div class="ui-row">
					<span id="sync-label">みんなと同期する</span>
					<Switch bind:checked={sync} labelledby="sync-label" name="sync" />
				</div>
			</div>
			<p class="ui-note">
				同期すると、同じ大学の人が「授業をさがす」で選べるようになります。「みんなの登録」に合わせた授業はいつも同期します。
			</p>

			<h2 class="count">{rows.length}件の授業（{included.length}件を追加）</h2>
			{#each rows as row, i (i)}
				<div class="course" class:off={!row.include}>
					<div class="head">
						<input class="check" type="checkbox" bind:checked={row.include} aria-label="{row.title}を追加する" />
						{#if row.sharedId}
							{@const s = row.suggestions.find((x) => x.id === row.sharedId)}
							<span class="title-fixed">{s?.title}</span>
						{:else}
							<input class="title" bind:value={row.title} maxlength="60" aria-label="授業名" />
						{/if}
					</div>

					{#if row.suggestions.length}
						<div class="suggest" role="radiogroup" aria-label="{row.title}の登録のしかた">
							{#each row.suggestions as s (s.id)}
								<label class="option">
									<input type="radio" name="shared-{i}" checked={row.sharedId === s.id} onchange={() => (row.sharedId = s.id)} />
									<span>みんなの登録「{s.title}」に合わせる<small>{s.slots.map(slotText).join('・')}</small></span>
								</label>
							{/each}
							<label class="option">
								<input type="radio" name="shared-{i}" checked={row.sharedId === null} onchange={() => (row.sharedId = null)} />
								<span>読み取った内容で登録する</span>
							</label>
						</div>
					{/if}

					{#if !row.sharedId}
						{#each row.slots as slot, j (j)}
							<div class="slot">
								<select bind:value={slot.weekday} aria-label="曜日">
									{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAY_NAMES[d]}</option>{/each}
								</select>
								<select bind:value={slot.period} aria-label="時限">
									{#if !periodNumbers.includes(slot.period)}<option value={slot.period}>{slot.period}限</option>{/if}
									{#each data.periods as p (p.number)}<option value={p.number}>{p.number}限</option>{/each}
								</select>
								<select bind:value={slot.span} aria-label="コマ数">
									{#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}コマ</option>{/each}
								</select>
								<input bind:value={slot.room} maxlength="20" placeholder="教室" aria-label="教室" />
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
							{#if !fits(slot)}
								<p class="taken">この時間割にない時限です。時限かコマ数を選び直してください</p>
							{:else if taken}
								<p class="taken">
									{same(taken, row.title) ? 'すでに時間割にあります' : `この時間には「${taken}」が入っています`}
								</p>
							{/if}
						{/each}
						<input class="teachers" bind:value={row.teachers} maxlength="200" placeholder="先生（なくてもOK・2人以上は「、」で区切る）" aria-label="先生" />
					{/if}
				</div>
			{/each}

			<input type="hidden" name="rows" value={payload} />
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button class="btn btn-primary" type="submit" disabled={saving || !included.length || !termIds.length || unfit}>
				{saving ? '保存中…' : `${included.length}件を時間割に追加`}
			</button>
		</form>
		<form class="dismiss" method="POST" action="?/dismiss" use:enhance>
			<button class="link" type="submit">追加しないで閉じる</button>
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

	.lead {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink-soft);
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

	.dismiss {
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
