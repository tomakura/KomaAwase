<script lang="ts">
	import { enhance } from '$app/forms';
	import { COURSE_COLORS, DAY_NAMES, WEEK_PATTERNS, courseColor, periodLabel, type Delivery, type WeekPattern } from '$lib/courses';

	type Slot = { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null };
	type SharedValues = {
		title: string;
		teachers: string[];
		slots: Slot[];
		delivery: Delivery | null;
		intensiveFrom: string | null;
		intensiveTo: string | null;
	};
	type CourseValues = SharedValues & {
		color: string;
		termIds: string[];
		syncMode: 'synced' | 'personal';
	};
	type Sync = {
		canSync: boolean;
		year: number;
		// The shared course this one is linked to
		shared: { id: string; source: 'syllabus' | 'user'; version: number; values: SharedValues } | null;
	};

	let {
		heading,
		backHref,
		action,
		sync,
		initial,
		terms,
		periods,
		message
	}: {
		heading: string;
		backHref: string;
		action?: string;
		sync: Sync;
		initial: CourseValues;
		terms: { id: string; name: string }[];
		periods: { number: number }[];
		message?: string;
	} = $props();

	// The form keeps its own copy; `initial` only seeds it.
	// svelte-ignore state_referenced_locally
	const v = $state({
		...structuredClone(initial),
		slots: initial.slots.map((s) => ({ ...s, week: s.week ?? 'every', room: s.room ?? '' })),
		unscheduled: initial.slots.length === 0 && initial.delivery !== null,
		delivery: initial.delivery ?? 'ondemand',
		intensiveFrom: initial.intensiveFrom ?? '',
		intensiveTo: initial.intensiveTo ?? ''
	});

	const periodNumbers = $derived(periods.map((p) => p.number));
	let saving = $state(false);

	// Syncing again shows the shared values, so local edits never overwrite them by accident.
	function setSync(mode: 'synced' | 'personal') {
		v.syncMode = mode;
		const shared = sync.shared?.values;
		if (mode !== 'synced' || !shared) return;
		v.title = shared.title;
		v.teachers = [...shared.teachers];
		v.slots = shared.slots.map((s) => ({ ...s, week: s.week ?? 'every', room: s.room ?? '' }));
		v.unscheduled = shared.slots.length === 0 && shared.delivery !== null;
		v.delivery = shared.delivery ?? 'ondemand';
		v.intensiveFrom = shared.intensiveFrom ?? '';
		v.intensiveTo = shared.intensiveTo ?? '';
	}

	const syncHeading = $derived(
		!sync.shared
			? 'この授業を同じ大学のみんなと共有できます'
			: sync.shared.source === 'syllabus'
				? 'シラバスの授業とつながっています'
				: 'みんなの登録の授業とつながっています'
	);
	const syncNote = $derived(
		v.syncMode === 'personal'
			? '授業名や教室を自分用に変えられます。ほかの人が直しても反映されません。'
			: sync.shared
				? '教室の変更などをだれかが直したときに自動で反映されます。コマを重ねたときも、同じ授業としてまとまります。ここで直した内容は、同期しているみんなにも反映されます。'
				: '同じ大学の人が授業をさがしたときに出てくるようになり、コマを重ねたときも同じ授業としてまとまります。'
	);

	let teacher = $state('');
	function addTeacher() {
		const name = teacher.trim();
		if (name && !v.teachers.includes(name)) v.teachers.push(name);
		teacher = '';
	}

	let picking = $state(false);
	let slotError = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	const pick = $state({ weekday: 1, period: periods[0]?.number ?? 1, span: 1 });
	const maxSpan = $derived(periodNumbers.length - periodNumbers.indexOf(pick.period));

	// How many periods the slot can run to: up to the end of the day or the next class that day
	function spanChoices(index: number) {
		const slot = v.slots[index];
		const start = periodNumbers.indexOf(slot.period);
		const choices: number[] = [];
		for (let n = 1; start >= 0 && start + n <= periodNumbers.length; n++) {
			const clash = v.slots.some((s, j) => {
				if (j === index || s.weekday !== slot.weekday) return false;
				const other = periodNumbers.indexOf(s.period);
				return other <= start + n - 1 && start <= other + s.span - 1;
			});
			if (clash) break;
			choices.push(n);
		}
		return choices.length ? choices : [slot.span];
	}

	function addSlot() {
		const start = periodNumbers.indexOf(pick.period);
		const span = Math.min(pick.span, maxSpan);
		const overlaps = v.slots.some((s) => {
			const other = periodNumbers.indexOf(s.period);
			return s.weekday === pick.weekday && other <= start + span - 1 && start <= other + s.span - 1;
		});
		if (overlaps) {
			slotError = 'その曜日・時限はもう入っています';
			return;
		}
		v.slots.push({ weekday: pick.weekday, period: pick.period, span, week: 'every', room: '' });
		v.slots.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
		slotError = null;
		picking = false;
	}
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<header>
		<div class="title-row">
			<a class="back" href={backHref} aria-label="もどる">
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			</a>
			<h1>{heading}</h1>
		</div>
		<button class="save" type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
	</header>

	<div class="body">
		{#if sync.canSync}
			<div class="sync">
				<div class="sync-head">
					<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
						<path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
					</svg>
					<span>{syncHeading}</span>
					<span class="badge">{sync.year}年度</span>
				</div>
				<div class="segmented" role="group" aria-label="同期">
					<button type="button" aria-pressed={v.syncMode === 'synced'} onclick={() => setSync('synced')}>
						みんなと同期する
					</button>
					<button type="button" aria-pressed={v.syncMode === 'personal'} onclick={() => setSync('personal')}>
						自分だけで使う
					</button>
				</div>
				<span class="note">{syncNote}</span>
			</div>
		{/if}
		<input type="hidden" name="sync" value={sync.canSync ? v.syncMode : 'personal'} />
		{#if sync.shared}
			<input type="hidden" name="shared_id" value={sync.shared.id} />
			<input type="hidden" name="shared_version" value={sync.shared.version} />
		{/if}

		{#if message}<p class="error" role="alert">{message}</p>{/if}

		<label class="field">
			授業名
			<input name="title" bind:value={v.title} maxlength="60" required autocomplete="off" />
		</label>

		<div class="group">
			<span class="label" id="teacher-label">先生（なくてもOK・何人でも）</span>
			{#if v.teachers.length}
				<div class="chips">
					{#each v.teachers as name, i (name)}
						<span class="chip">
							{name}
							<button type="button" aria-label="{name}を外す" onclick={() => v.teachers.splice(i, 1)}>
								<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
							</button>
						</span>
						<input type="hidden" name="teacher" value={name} />
					{/each}
				</div>
			{/if}
			<div class="inline">
				<input
					bind:value={teacher}
					placeholder="先生の名前"
					aria-labelledby="teacher-label"
					maxlength="30"
					autocomplete="off"
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.isComposing) {
							e.preventDefault();
							addTeacher();
						}
					}}
				/>
				<button class="secondary" type="button" onclick={addTeacher}>追加</button>
			</div>
		</div>

		<div class="group">
			<span class="label">色</span>
			<div class="swatches">
				{#each COURSE_COLORS as c (c.id)}
					<label class="swatch" style:--c={courseColor(c.id)}>
						<input type="radio" name="color" value={c.id} bind:group={v.color} aria-label={c.label} />
					</label>
				{/each}
			</div>
		</div>

		<div class="group">
			<span class="label">開講する学期（いくつでも）</span>
			<div class="terms">
				{#each terms as t (t.id)}
					<label class="term">
						<input type="checkbox" name="term" value={t.id} bind:group={v.termIds} />
						{t.name}
					</label>
				{/each}
			</div>
		</div>

		{#if !v.unscheduled}
			<div class="group">
				<span class="label">曜日・時限と教室</span>
				{#each v.slots as slot, i (`${slot.weekday}-${slot.period}`)}
					{@const label = `${DAY_NAMES[slot.weekday]} ${periodLabel(slot.period, slot.span, periodNumbers)}`}
					<div class="slot-row">
						<span class="slot-label">{label}</span>
						<!-- Longer or shorter in place, without taking the slot out and adding it again -->
						<select class="span" bind:value={slot.span} aria-label="{label}のコマ数">
							{#each spanChoices(i) as n (n)}<option value={n}>{n}コマ</option>{/each}
						</select>
						<button type="button" class="remove" aria-label="{label}を外す" onclick={() => v.slots.splice(i, 1)}>
							<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
						<!-- Classes on alternate weeks share a slot with another course -->
						<select class="week" bind:value={slot.week} aria-label="{label}の週">
							{#each WEEK_PATTERNS as w (w.id)}<option value={w.id}>{w.label}</option>{/each}
						</select>
						<input bind:value={slot.room} placeholder="教室" aria-label="{label}の教室" maxlength="20" autocomplete="off" />
						<input type="hidden" name="slot" value={JSON.stringify(slot)} />
					</div>
				{/each}
				{#if picking}
					<div class="picker">
						<select bind:value={pick.weekday} aria-label="曜日">
							{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAY_NAMES[d]}曜</option>{/each}
						</select>
						<select bind:value={pick.period} aria-label="時限">
							{#each periods as p (p.number)}<option value={p.number}>{p.number}限</option>{/each}
						</select>
						<select bind:value={pick.span} aria-label="続けて何コマか">
							{#each [1, 2, 3].filter((n) => n <= maxSpan) as n (n)}
								<option value={n}>{n === 1 ? '1コマ' : `${n}コマ続き`}</option>
							{/each}
						</select>
						<button class="secondary" type="button" onclick={addSlot}>追加</button>
						<button
							type="button"
							class="remove"
							aria-label="追加をやめる"
							onclick={() => {
								picking = false;
								slotError = null;
							}}
						>
							<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</div>
					{#if slotError}<p class="error" role="alert">{slotError}</p>{/if}
				{:else}
					<button type="button" class="add-slot" onclick={() => (picking = true)}>
						<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
						曜日・時限を追加
					</button>
				{/if}
				<span class="note">
					週に何回かある授業は、ここに並べると一度に登録できます。メモや資料はどの曜日・時限から開いても同じものが見られます。
				</span>
			</div>
		{/if}

		<label class="check">
			<input type="checkbox" name="unscheduled" bind:checked={v.unscheduled} />
			曜日・時限がない（オンデマンド・集中講義）
		</label>

		{#if v.unscheduled}
			<div class="group">
				<div class="segmented" role="group" aria-label="授業の形">
					<button type="button" aria-pressed={v.delivery === 'ondemand'} onclick={() => (v.delivery = 'ondemand')}>
						オンデマンド
					</button>
					<button type="button" aria-pressed={v.delivery === 'intensive'} onclick={() => (v.delivery = 'intensive')}>
						集中講義
					</button>
				</div>
				<input type="hidden" name="delivery" value={v.delivery} />
				{#if v.delivery === 'intensive'}
					<div class="dates">
						<label class="field">
							はじまり（なくてもOK）
							<input type="date" name="intensive_from" bind:value={v.intensiveFrom} />
						</label>
						<label class="field">
							おわり
							<input type="date" name="intensive_to" bind:value={v.intensiveTo} />
						</label>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</form>

<style>
	form {
		max-width: 480px;
		margin: 0 auto;
		padding-bottom: 32px;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 8px 6px;
		background: var(--bg);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.back {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 20px;
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.save {
		height: 40px;
		margin-right: 8px;
		padding: 0 16px;
		border: none;
		border-radius: 12px;
		background: var(--ink);
		color: var(--bg);
		font-family: inherit;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
	}

	.save:disabled {
		opacity: 0.6;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px 16px 0;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.sync {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.sync-head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
	}

	.sync-head span:first-of-type {
		flex-grow: 1;
	}

	.badge {
		flex-shrink: 0;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--slot);
		font-size: 11px;
	}

	.label {
		font-size: 12px;
		color: var(--ink-sub);
	}

	/* 16px, not the mock's 15px: iOS zooms into smaller inputs. */
	input:not([type='checkbox'], [type='radio'], [type='hidden']),
	select {
		height: 44px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		height: 32px;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 0 2px 0 10px;
		border-radius: 16px;
		background: var(--slot);
		font-size: 13px;
	}

	.chip button {
		width: 28px;
		height: 28px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 14px;
		background: transparent;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.chip svg {
		stroke-width: 2;
	}

	.inline {
		display: flex;
		gap: 6px;
	}

	.inline input {
		flex: 1 1 0;
		min-width: 0;
	}

	.secondary {
		height: 44px;
		flex-shrink: 0;
		padding: 0 14px;
		border: 1px solid var(--line-bold);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 10px;
		justify-items: center;
	}

	.swatch {
		width: 40px;
		height: 40px;
		box-sizing: border-box;
		border-radius: 20px;
		border: 1px solid var(--line-strong);
		background: var(--c);
		cursor: pointer;
	}

	.swatch:has(:checked) {
		border: 2px solid var(--ink);
		box-shadow: inset 0 0 0 2px var(--surface);
	}

	.swatch:has(:focus-visible),
	.term:has(:focus-visible),
	.check:has(:focus-visible) {
		outline: 2px solid var(--ai);
		outline-offset: 2px;
	}

	.swatch input,
	.term input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.terms {
		display: flex;
		gap: 6px;
	}

	.term {
		flex: 1 1 0;
		height: 40px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		color: var(--ink-sub);
		font-size: 14px;
		cursor: pointer;
	}

	.term:has(:checked) {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--surface);
		font-weight: 700;
	}

	/* Two lines: the slot, its length and the remove button; then the weeks and the room */
	.slot-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.slot-label {
		min-width: 52px;
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 700;
	}

	.slot-row .span {
		justify-self: start;
		width: 88px;
		height: 36px;
		padding: 0 4px;
		border-color: var(--line);
		border-radius: 9px;
		background: var(--bg);
	}

	/* 16px like the other fields, so iOS doesn't zoom in on it */
	.slot-row .week {
		width: 88px;
		flex-shrink: 0;
		height: 36px;
		padding: 0 4px;
		border-color: var(--line);
		border-radius: 9px;
		background: var(--bg);
	}

	.slot-row input {
		grid-column: 2 / 4;
		min-width: 0;
		height: 36px;
		padding: 0 10px;
		border-color: var(--line);
		border-radius: 9px;
		background: var(--bg);
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

	.picker {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.picker select {
		flex: 1 1 0;
		min-width: 0;
		padding: 0 8px;
	}

	.add-slot {
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px dashed var(--line-bold);
		border-radius: 12px;
		background: transparent;
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.note {
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-sub);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 14px;
	}

	.check input {
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--ink);
	}

	.segmented {
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--slot);
	}

	.segmented button {
		flex: 1 1 0;
		height: 38px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}

	.segmented button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}

	.dates {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.dates input {
		width: 100%;
	}
</style>
