<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { fade, slide } from 'svelte/transition';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { connection } from '$lib/connection.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { DAY_NAMES } from '$lib/courses';
	import { glide } from '$lib/glide';
	import { iconOf } from '$lib/icons';
	import { motion } from '$lib/motion';
	import { OVERLAY_COOKIE, cellKey, classFill, lookingAt, overlay, termOn, type OverlayGroup, type OverlayPerson } from '$lib/overlay';
	import { currentTerm } from '$lib/terms';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	const today = $derived(tokyoTime(data.now).date);
	// svelte-ignore state_referenced_locally
	let termId = $state((data.mine.terms.find((t) => t.id === data.termParam) ?? currentTerm(data.mine.terms, tokyoTime(data.now).date))?.id);
	const term = $derived(data.mine.terms.find((t) => t.id === termId));
	const date = $derived(lookingAt(term, today));

	// The chips answer at once; the timetables follow when the page data comes back.
	// svelte-ignore state_referenced_locally
	let selected = $state<string[]>(data.selected);
	$effect(() => {
		selected = data.selected;
	});

	const people = $derived(new Map([[data.me.id, { ...data.me, university: null, friend: true }], ...data.people.map((p) => [p.id, p] as const)]));
	const friends = $derived(data.people.filter((p) => p.friend));
	// Group members who aren't friends appear as chips once they are chosen.
	const others = $derived(data.people.filter((p) => !p.friend && selected.includes(p.id)));

	function query(next: string[]) {
		const params = new URLSearchParams();
		if (next.length) params.set('with', next.join(','));
		if (termId) params.set('term', termId);
		return `?${params}`;
	}

	function apply(next: string[]) {
		// Others' timetables come from the server. Without a connection the choice stays as it is
		// (the chip, and the cookie that keeps it), and the reason is shown, unless that view was kept.
		if (!connection.guardNavigation(new URL(query(next), location.href), location.pathname)) return;
		selected = next;
		document.cookie = `${OVERLAY_COOKIE}=${next.join(',')}; path=/; max-age=31536000; samesite=lax`;
		goto(query(next), { replaceState: true, noScroll: true, keepFocus: true });
	}

	const toggle = (id: string) => apply(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
	const groupOn = (g: (typeof data.groups)[number]) => g.memberIds.length > 0 && g.memberIds.every((id) => selected.includes(id));
	function toggleGroup(g: (typeof data.groups)[number]) {
		apply(groupOn(g) ? selected.filter((id) => !g.memberIds.includes(id)) : [...new Set([...selected, ...g.memberIds])]);
	}

	// Everyone's classes in the term being looked at: the viewer's by the tab, others' by the date
	const layers = $derived.by((): OverlayPerson[] => {
		const mine: OverlayPerson = {
			id: data.me.id,
			universityId: data.me.universityId,
			periods: data.mine.periods,
			courses: data.mine.courses.filter((c) => termId && c.termIds.includes(termId))
		};
		const rest = selected.flatMap((id): OverlayPerson[] => {
			const tt = data.timetables[id];
			const person = people.get(id);
			if (!tt || !person) return [];
			const t = termOn(tt.terms, date, term?.name ?? null);
			return [
				{
					id,
					universityId: 'universityId' in person ? person.universityId : null,
					periods: tt.periods,
					courses: tt.courses.filter((c) => t && c.termIds.includes(t.id))
				}
			];
		});
		return [mine, ...rest];
	});

	const days = $derived(
		[...new Set([...data.days, ...layers.flatMap((l) => l.courses.flatMap((c) => c.slots.map((s) => s.weekday)))])].sort((a, b) => a - b)
	);
	const result = $derived(overlay(data.mine.periods, days, layers));

	const freeByDay = $derived(
		days.flatMap((day) => {
			const periods = result.free.filter((f) => f.weekday === day).map((f) => f.period);
			return periods.length ? [[day, periods] as const] : [];
		})
	);

	const elsewhere = $derived(
		selected.flatMap((id) => {
			const p = data.people.find((x) => x.id === id);
			return p && data.timetables[id] && p.universityId !== data.me.universityId ? [p.nickname] : [];
		})
	);
	const missing = $derived(
		selected.flatMap((id) => (id in data.timetables && data.timetables[id] === null ? [people.get(id)?.nickname] : []))
	);

	let open = $state<{ weekday: number; period: number } | null>(null);
	const openGroups = $derived(open ? (result.cells.get(cellKey(open.weekday, open.period)) ?? []) : []);
	const openPeriod = $derived(open ? data.mine.periods.find((p) => p.number === open?.period) : undefined);
	// Who is free in the slot that's open
	const openFree = $derived(
		layers.filter((l) => !openGroups.some((g) => g.people.some((x) => x.id === l.id))).map((l) => personOf(l.id).nickname)
	);
	const time = (t: string) => t.replace(/^0/, '');
	const personOf = (id: string) => people.get(id) ?? { id, nickname: '?', icon: null };
	// Everyone's classes are in the color of their icon, so the chip, the icon and the class match
	const colorOf = (id: string) => iconOf(personOf(id)).hex;
	const fillOf = (g: OverlayGroup) => classFill(g.people.map((x) => colorOf(x.id)));
	const differs = (g: OverlayGroup['people'][number]) => {
		const p = data.people.find((x) => x.id === g.id);
		return !!p && p.universityId !== data.me.universityId;
	};
</script>

<svelte:head>
	<title>コマを重ねる · コマあわせ</title>
</svelte:head>

<div class="screen">
	<header>
		<h1>コマを重ねる</h1>
	</header>

	<TermBar year={data.year} terms={data.mine.terms} bind:termId onchange={() => replaceState(query(selected), {})} />

	<div class="chips" role="group" aria-label="重ねる人">
		<span class="chip me" style:--p={colorOf(data.me.id)}><UserIcon user={data.me} size={24} short />自分</span>
		{#each friends as f (f.id)}
			<button type="button" class="chip" style:--p={colorOf(f.id)} aria-pressed={selected.includes(f.id)} onclick={() => toggle(f.id)}>
				<UserIcon user={f} size={24} short />{f.nickname}
			</button>
		{/each}
		{#each others as f (f.id)}
			<button type="button" class="chip" style:--p={colorOf(f.id)} aria-pressed="true" onclick={() => toggle(f.id)}>
				<UserIcon user={f} size={24} short />{f.nickname}
			</button>
		{/each}
		{#each data.groups as g (g.id)}
			<button
				type="button"
				class="chip group"
				aria-pressed={groupOn(g)}
				disabled={!g.memberIds.length}
				onclick={() => toggleGroup(g)}
			>
				<Icon name="users" size={16} />{g.name}
			</button>
		{/each}
	</div>

	{#if !friends.length && !data.groups.length}
		<p class="hint">
			友だちを追加すると、時間割を重ねて、みんなが空いているコマを探せます。
			<a href="/friends/add">友だちを追加する</a>
		</p>
	{:else if !selected.length}
		<p class="hint">重ねる人を選んでください。</p>
	{/if}

	<div class="grid" use:glide={days.length} style:--days={days.length} style:--periods={data.mine.periods.length}>
		{#each days as day, i (day)}
			<span class="day" style:grid-column={i + 2}>{DAY_NAMES[day]}</span>
		{/each}
		{#each data.mine.periods as p, r (p.number)}
			<span class="period" style:grid-row={r + 2}>
				<span class="number">{p.number}</span>
				<span class="start">{time(p.start)}</span>
			</span>
			{#each days as day, c (day)}
				{@const groups = result.cells.get(cellKey(day, p.number)) ?? []}
				<button
					type="button"
					class="cell"
					class:free={!groups.length}
					style:grid-row={r + 2}
					style:grid-column={c + 2}
					aria-label="{DAY_NAMES[day]}曜{p.number}限 {groups.length
						? groups.map((g) => `${g.title}：${g.people.map((x) => personOf(x.id).nickname).join('・')}`).join('、')
						: 'みんな空き'}"
					onclick={() => (open = { weekday: day, period: p.number })}
				>
					{#each groups as g (g.key)}
						<span class="course" style:background={fillOf(g)} transition:fade={motion(200)}>
							<span class="title">{g.title}</span>
							<span class="people">
								{#each g.people as x (x.id)}<UserIcon user={personOf(x.id)} size={16} short />{/each}
							</span>
						</span>
					{/each}
				</button>
			{/each}
		{/each}
	</div>

	<section class="free-card">
		<h2>みんな空いてるコマ</h2>
		{#if result.free.length}
			<!-- By day, which reads faster than one chip per slot -->
			<div class="free-days">
				{#each freeByDay as [day, periods] (day)}
					<div class="free-day" transition:slide={motion(200)}>
						<span class="free-label">{DAY_NAMES[day]}</span>
						<span class="free-list">
							{#each periods as period (period)}<span class="free-chip" transition:fade={motion(180)}>{period}限</span>{/each}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<p>重なる空きコマはありません</p>
		{/if}
		{#if elsewhere.length}
			<p>{elsewhere.join('さん・')}さんは別の大学です。授業の時刻に合わせて表示しています。</p>
		{/if}
		{#if missing.length}
			<p>{missing.join('さん・')}さんは、まだ{data.year}年度の時間割がありません。</p>
		{/if}
	</section>

	<div class="spacer"></div>
	<BottomNav current="overlay" />
</div>

<Sheet
	open={!!open}
	onclose={() => (open = null)}
	title={open ? `${DAY_NAMES[open.weekday]}曜 ${open.period}限${openPeriod ? `（${time(openPeriod.start)}〜${time(openPeriod.end)}）` : ''}` : ''}
>
	{#if openGroups.length}
		<div class="ui-list">
			{#each openGroups as g (g.key)}
				<div class="detail" style:background={fillOf(g)}>
					<span class="detail-title">{g.title}</span>
					{#each g.people as x (x.id)}
						<span class="who">
							<UserIcon user={personOf(x.id)} size={22} short />
							<span>{personOf(x.id).nickname}</span>
							<span class="meta">{[differs(x) ? x.time : null, x.room].filter(Boolean).join(' · ')}</span>
						</span>
					{/each}
				</div>
			{/each}
		</div>
		<p class="ui-note">{openFree.length ? `空いている人：${openFree.join('・')}` : '全員が授業です。'}</p>
	{:else}
		<p class="ui-note">みんな空いています。</p>
	{/if}
	<button class="btn" type="button" onclick={() => (open = null)}>とじる</button>
</Sheet>

<style>
	header {
		padding: 18px 16px 4px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 22px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 16px 12px;
	}

	.chip {
		height: 36px;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px 0 6px;
		border: 1px solid var(--line-strong);
		border-radius: 18px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.chip[aria-pressed='false'] {
		opacity: 0.6;
	}

	.chip[aria-pressed='true'],
	.chip.me {
		border-color: var(--ink);
		background: var(--surface);
		color: var(--ink);
		opacity: 1;
	}

	.chip.me {
		cursor: default;
	}

	/* Each person's chip is in their color, the one their classes are in below */
	.chip:not(.group)[aria-pressed='true'],
	.chip.me {
		border-color: var(--p);
		background: color-mix(in srgb, var(--p) 16%, var(--surface));
	}

	.chip.group {
		padding-left: 12px;
		border-style: dashed;
		border-color: var(--line-bold);
		color: var(--ink);
		opacity: 1;
	}

	.chip.group[aria-pressed='true'] {
		border-style: solid;
		border-color: var(--ink);
	}

	.chip:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.hint {
		margin: 0;
		padding: 0 16px 12px;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-soft);
	}

	/* Rows share the tallest one's height (1fr in an auto-height grid). */
	.grid {
		display: grid;
		grid-template-columns: 30px repeat(var(--days), minmax(0, 1fr));
		grid-template-rows: 20px repeat(var(--periods), minmax(64px, 1fr));
		gap: 3px;
		padding: 0 10px;
	}

	.day {
		grid-row: 1;
		text-align: center;
		font-size: 12px;
		font-weight: 500;
		color: var(--ink-sub);
	}

	.period {
		grid-column: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding-top: 5px;
	}

	.number {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 13px;
	}

	.start {
		font-size: 9px;
		color: var(--ink-sub);
	}

	.cell {
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 3px;
		overflow: hidden;
		border: 1px solid var(--slot);
		border-radius: 8px;
		background: var(--slot);
		color: var(--ink);
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}

	/* Free slots stay quiet: an empty frame */
	.cell.free {
		border-color: var(--line);
		background: transparent;
	}

	.course {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 3px 3px 3px 8px;
		border-radius: 5px;
		background: var(--raised);
	}

	.title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 10px;
		font-weight: 700;
		line-height: 1.3;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.people {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}

	.free-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 14px 12px 0;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.free-card h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
	}

	.free-card p {
		margin: 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--ink-sub);
	}

	.free-days {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.free-day {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.free-label {
		width: 18px;
		padding-top: 3px;
		font-size: 13px;
		font-weight: 700;
	}

	.free-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.free-chip {
		padding: 2px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 7px;
		font-size: 12px;
	}

	.spacer {
		height: 20px;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px 10px 20px;
	}

	.detail-title {
		font-size: 14px;
		font-weight: 700;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}

	.meta {
		margin-left: auto;
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
