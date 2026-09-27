<script lang="ts">
	import { replaceState } from '$app/navigation';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { DAY_NAMES, courseColor, courseHref, deliveryLabel, timetableHref } from '$lib/courses';
	import { toMinutes, tokyoTime } from '$lib/time';

	let { data } = $props();

	// Open on the term in the URL (coming back from a course), else the term that is on now,
	// or during a break the next one to start.
	function initialTerm() {
		const today = tokyoTime(data.now).date;
		const term =
			data.terms.find((t) => t.id === data.termParam) ??
			data.terms.find((t) => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate) ??
			data.terms.find((t) => t.startDate && today < t.startDate) ??
			data.terms[0];
		return term?.id;
	}

	let termId = $state(initialTerm());
	const term = $derived(data.terms.find((t) => t.id === termId));

	function selectTerm(id: string) {
		termId = id;
		replaceState(timetableHref(id), {});
	}

	// Starts at the server's time so hydration matches, then follows the browser's clock.
	// svelte-ignore state_referenced_locally
	let now = $state(data.now);
	$effect(() => {
		const tick = () => (now = Date.now());
		tick();
		const timer = setInterval(tick, 30_000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', tick);
		};
	});
	const clock = $derived(tokyoTime(now));
	// Classes are only on in a term that includes today; a term without dates always is.
	const termIsOn = $derived(
		!!term &&
			(!term.startDate || !term.endDate || (term.startDate <= clock.date && clock.date <= term.endDate))
	);

	const days = $derived(data.days.toSorted((a, b) => a - b));
	const rowOf = $derived(new Map(data.periods.map((p, i) => [p.number, i + 2])));
	const colOf = $derived(new Map(days.map((d, i) => [d, i + 2])));
	const lastRow = $derived(data.periods.length + 1);
	const todayShown = $derived(colOf.has(clock.weekday));
	const isNow = (start: string, end: string) =>
		toMinutes(start) <= clock.minutes && clock.minutes < toMinutes(end);

	// Progress (0-1) and minutes left while a slot is in session, from its first period's
	// start to its last period's end.
	function session(weekday: number, row: number, span: number) {
		if (!termIsOn || weekday !== clock.weekday) return null;
		const start = toMinutes(data.periods[row - 2].start);
		const end = toMinutes(data.periods[row - 2 + span - 1].end);
		if (clock.minutes < start || clock.minutes >= end) return null;
		return { progress: (clock.minutes - start) / (end - start), left: Math.ceil(end - clock.minutes) };
	}

	const termCourses = $derived(data.courses.filter((c) => termId && c.termIds.includes(termId)));
	const cells = $derived(
		termCourses.flatMap((course) =>
			course.slots.flatMap((slot) => {
				const row = rowOf.get(slot.period);
				const col = colOf.get(slot.weekday);
				if (!row || !col) return [];
				const span = Math.min(slot.span, lastRow - row + 1);
				return [{ course, slot, row, col, span, live: session(slot.weekday, row, span) }];
			})
		)
	);
	const unscheduled = $derived(termCourses.filter((c) => c.slots.length === 0));

	// 8:40, not 08:40
	const time = (hhmm: string) => hhmm.replace(/^0/, '');
</script>

<svelte:head>
	<title>時間割 · コマあわせ</title>
</svelte:head>

<div class="screen">
	<header>
		<div class="brand">
			<svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
				<rect x="4" y="8" width="26" height="26" rx="7" fill="var(--shu)" />
				<rect x="18" y="14" width="26" height="26" rx="7" fill="var(--ai)" class="overlap" />
			</svg>
			<span>コマあわせ</span>
		</div>
		<!-- The export screen comes later. -->
		<button class="icon-button" type="button" aria-label="画像で書き出す" disabled>
			<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
			</svg>
		</button>
	</header>

	<main>
		<div class="term-bar">
			<div class="term-title">
				<span class="year">{data.year}年度</span>
				<span class="group">{term?.groupName ?? term?.name ?? ''}</span>
			</div>
			<div class="tabs" role="group" aria-label="学期">
				{#each data.terms as t (t.id)}
					<button type="button" aria-pressed={t.id === termId} onclick={() => selectTerm(t.id)}>
						{t.name}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid" style:--days={days.length} style:--periods={data.periods.length}>
			{#each days as day, i (day)}
				<div class="day" style:grid-column={i + 2}>
					{#if day === clock.weekday}
						<span class="today-mark" aria-label="{DAY_NAMES[day]}曜日（今日）">{DAY_NAMES[day]}</span>
					{:else}
						{DAY_NAMES[day]}
					{/if}
				</div>
			{/each}

			{#each data.periods as p, i (p.number)}
				<div class="period" class:now={todayShown && isNow(p.start, p.end)} style:grid-row={i + 2}>
					<span class="number">{p.number}</span>
					<span class="start">{time(p.start)}</span>
					<span class="end">{time(p.end)}</span>
				</div>
				{#each days as day, j (day)}
					<a
						class="slot"
						class:today={day === clock.weekday}
						href="/courses/new?term={termId}&day={day}&period={p.number}"
						aria-label="{DAY_NAMES[day]}曜{p.number}限に授業を追加"
						style:grid-row={i + 2}
						style:grid-column={j + 2}
					></a>
				{/each}
			{/each}

			{#each cells as { course, slot, row, col, span, live } (`${course.id}-${slot.weekday}-${slot.period}`)}
				<a
					class="course"
					class:live
					href={courseHref(course.id, termId ?? null)}
					style:grid-row="{row} / span {span}"
					style:grid-column={col}
					style:--c={courseColor(course.color)}
					style:--progress={live ? `${live.progress * 100}%` : undefined}
				>
					<span class="title">
						{#each course.titleParts as part, k}{#if k}<wbr />{/if}{part}{/each}
					</span>
					{#if live}<span class="left">あと{live.left}分</span>{/if}
					{#if slot.room}<span class="room">{slot.room}</span>{/if}
				</a>
			{/each}
		</div>

		{#if unscheduled.length}
			<section class="unscheduled">
				<h2>曜日・時限なし</h2>
				<div class="cards">
					{#each unscheduled as course (course.id)}
						{@const label = deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo)}
						<a class="card" href={courseHref(course.id, termId ?? null)} style:--c={courseColor(course.color)}>
							<span>{#each course.titleParts as part, k}{#if k}<wbr />{/if}{part}{/each}</span>
							{#if label}<span class="delivery">{label}</span>{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}
	</main>

	<BottomNav current="timetable" />
</div>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 6px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 18px;
		letter-spacing: 0.02em;
	}

	.overlap {
		mix-blend-mode: var(--logo-blend);
	}

	.icon-button {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--ink);
	}

	.icon-button svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	main {
		padding-bottom: 20px;
	}

	.term-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 16px 12px;
	}

	.term-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.year {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.group {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 17px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 3px;
		background: var(--slot);
		border-radius: 12px;
	}

	.tabs button {
		min-width: 44px;
		height: 36px;
		padding: 0 8px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ink-sub);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.tabs button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--line-strong);
	}

	.grid {
		display: grid;
		grid-template-columns: 36px repeat(var(--days), minmax(0, 1fr));
		grid-template-rows: 26px repeat(var(--periods), 72px);
		gap: 4px;
		padding: 0 12px;
	}

	.day {
		grid-row: 1;
		display: flex;
		align-items: center;
		justify-content: center;
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
		border-radius: 8px;
		font-size: 10px;
	}

	.period .number {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 13px;
	}

	.period .start {
		color: var(--ink-soft);
	}

	.period .end {
		color: var(--ink-sub);
	}

	.period.now {
		background: var(--course-orange);
		color: var(--now-text);
	}

	.period.now span {
		color: inherit;
	}

	.today-mark {
		width: 24px;
		height: 24px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		background: var(--ink);
		color: var(--surface);
		font-weight: 700;
	}

	.slot {
		border-radius: 8px;
		background: var(--slot);
	}

	.course,
	.card {
		color: var(--ink);
		text-decoration: none;
	}

	.slot.today {
		background: var(--slot-today);
	}

	.course {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		/* 3px, not the mock's 4px, so five characters (ドイツ語Ⅰ) fit on a phone */
		padding: 5px 3px;
		border-radius: 8px;
		background: var(--c);
		overflow: hidden;
	}

	/* The cell itself is the progress bar, filling from the top. */
	.course.live {
		--fill: oklch(from var(--c) calc(l + var(--live-fill-dl)) calc(c + var(--live-fill-dc)) h);
		background-image: linear-gradient(to bottom, var(--fill) var(--progress), var(--c) var(--progress));
		box-shadow: inset 0 0 0 2px var(--ink);
	}

	.left {
		flex-shrink: 0;
		align-self: center;
		font-size: 10px;
		font-weight: 700;
		color: oklch(from var(--c) var(--live-text-l) calc(c + var(--live-text-dc)) h);
	}

	/* A long title is cut off rather than pushing the room out of the cell. */
	.title {
		min-height: 0;
		overflow: hidden;
		font-size: 11px;
		font-weight: 700;
		line-height: 1.25;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.room {
		flex-shrink: 0;
		margin-top: auto;
		align-self: center;
		max-width: 100%;
		box-sizing: border-box;
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--surface);
		font-size: 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.unscheduled {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 12px 0;
	}

	h2 {
		margin: 0;
		padding-left: 2px;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 7px 8px;
		border-radius: 8px;
		background: var(--c);
		font-size: 12px;
		font-weight: 700;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.delivery {
		flex-shrink: 0;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--surface);
		font-size: 10px;
		font-weight: 400;
		white-space: nowrap;
	}
</style>
