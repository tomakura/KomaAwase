<script lang="ts" module>
	import type { CalendarDay, ClassMove } from '$lib/calendar';
	import type { WeekPattern } from '$lib/courses';

	export type GridSlot = { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null };
	export type GridCourse = {
		id: string;
		color: string;
		title: string;
		slots: GridSlot[];
		// Cancelled days (YYYY-MM-DD); only the owner's own timetable has them
		cancels?: string[];
		// Days other people syncing the class have marked as cancelled (a guess, not the owner's own)
		maybeCancels?: string[];
		// Single classes held on another day; only the owner's own timetable has them
		moves?: ClassMove[];
	};
</script>

<script lang="ts">
	import { wrapTitle } from '$lib/wrap-title';
	import { offOn } from '$lib/calendar';
	import { DAY_NAMES, courseColor, meetsInWeek } from '$lib/courses';
	import { addDays, monthDay, toMinutes, type TokyoTime, weekdayOf } from '$lib/time';

	let {
		periods,
		days,
		courses,
		clock,
		termIsOn,
		slotHref,
		courseHref,
		slotLabel = (day: number, period: number) => `${DAY_NAMES[day]}曜${period}限に授業を追加`,
		showToday = true,
		termStart = null,
		stagger = false,
		calendar = [],
		dayHref
	}: {
		periods: { number: number; start: string; end: string }[];
		days: number[];
		courses: GridCourse[];
		clock: TokyoTime;
		// Classes are only in session in a term that includes today.
		termIsOn: boolean;
		// Links for empty slots and courses; without them the grid is read-only.
		slotHref?: (day: number, period: number) => string;
		courseHref?: (courseId: string) => string;
		slotLabel?: (day: number, period: number) => string;
		// Off for a past year, where today's column means nothing
		showToday?: boolean;
		// The term's first day, from which odd and even weeks are counted
		termStart?: string | null;
		// The cells appear one after another from the top left, once (a term just chosen)
		stagger?: boolean;
		// Days off and exam periods; a day off in the coming week shows on its column
		calendar?: CalendarDay[];
		// A link for the weekday headings
		dayHref?: (day: number) => string;
	} = $props();

	const rowOf = $derived(new Map(periods.map((p, i) => [p.number, i + 2])));
	const colOf = $derived(new Map(days.map((d, i) => [d, i + 2])));
	const lastRow = $derived(periods.length + 1);
	const todayShown = $derived(showToday && colOf.has(clock.weekday));
	const isToday = (day: number) => showToday && day === clock.weekday;
	// The date of a weekday in the coming week (today included)
	const dateOf = (weekday: number) => addDays(clock.date, (weekday - clock.weekday + 7) % 7);
	const offDay = (weekday: number) => (showToday ? offOn(calendar, dateOf(weekday)) : undefined);
	const isNow = (start: string, end: string) =>
		toMinutes(start) <= clock.minutes && clock.minutes < toMinutes(end);

	// Progress (0-1) and minutes left while a slot is in session, from its first period's
	// start to its last period's end.
	function session(weekday: number, row: number, span: number) {
		if (!termIsOn || weekday !== clock.weekday) return null;
		const start = toMinutes(periods[row - 2].start);
		const end = toMinutes(periods[row - 2 + span - 1].end);
		if (clock.minutes < start || clock.minutes >= end) return null;
		return { progress: (clock.minutes - start) / (end - start), left: Math.ceil(end - clock.minutes) };
	}

	type Cell = {
		course: GridCourse;
		slot: GridSlot;
		row: number;
		col: number;
		span: number;
		live: { progress: number; left: number } | null;
		cancel: string | null;
		maybe: string | null;
		// False for a slot on alternate weeks that doesn't meet this week
		meets: boolean;
		// A day off, or the class held on another day (away) or moved here (moved)
		off?: string | null;
		away?: string | null;
		moved?: string | null;
	};

	const cells = $derived(
		courses.flatMap((course) =>
			course.slots.flatMap((slot): Cell[] => {
				const row = rowOf.get(slot.period);
				const col = colOf.get(slot.weekday);
				if (!row || !col) return [];
				const span = Math.min(slot.span, lastRow - row + 1);
				// A cancellation for this weekday within the coming week; a cancelled class isn't in session.
				const cancel =
					(course.cancels ?? [])
						.filter((d) => weekdayOf(d) === slot.weekday && d >= clock.date && d <= addDays(clock.date, 6))
						.sort()[0] ?? null;
				const maybe = cancel
					? null
					: ((course.maybeCancels ?? [])
							.filter((d) => weekdayOf(d) === slot.weekday && d >= clock.date && d <= addDays(clock.date, 6))
							.sort()[0] ?? null);
				const meets = meetsInWeek(slot.week, termStart, clock.date);
				const date = dateOf(slot.weekday);
				const off = offDay(slot.weekday) ? date : null;
				const away = course.moves?.some((m) => m.fromDate === date) ? date : null;
				const live = cancel === clock.date || off || away === clock.date || !meets ? null : session(slot.weekday, row, span);
				return [{ course, slot, row, col, span, live, cancel, maybe, meets, off, away }];
			}).concat(movedHere(course))
		)
	);

	// Classes moved to a day of the coming week, in the period they moved to
	function movedHere(course: GridCourse): Cell[] {
		if (!showToday) return [];
		return (course.moves ?? []).flatMap((m) => {
			if (m.toDate < clock.date || m.toDate > addDays(clock.date, 6)) return [];
			const weekday = weekdayOf(m.toDate);
			const row = rowOf.get(m.period);
			const col = colOf.get(weekday);
			if (!row || !col) return [];
			const span = Math.min(m.span, lastRow - row + 1);
			const slot = { weekday, period: m.period, span: m.span, room: m.room };
			const live = m.toDate === clock.date ? session(weekday, row, span) : null;
			return [{ course, slot, row, col, span, live, cancel: null, maybe: null, meets: true, moved: m.toDate }];
		});
	}

	// Courses that share a slot (a mistake, or classes on alternate weeks) are stacked in it
	// instead of covering each other.
	const stacks = $derived.by(() => {
		const out: { row: number; col: number; span: number; cells: Cell[] }[] = [];
		const sorted = cells.toSorted((a, b) => a.col - b.col || a.row - b.row);
		for (const cell of sorted) {
			const last = out.at(-1);
			if (last && last.col === cell.col && cell.row < last.row + last.span) {
				last.span = Math.max(last.span, cell.row + cell.span - last.row);
				last.cells.push(cell);
			} else {
				out.push({ row: cell.row, col: cell.col, span: cell.span, cells: [cell] });
			}
		}
		return out;
	});

	// 8:40, not 08:40
	const time = (hhmm: string) => hhmm.replace(/^0/, '');
</script>

{#snippet course({ course, slot, live, cancel, maybe, meets, off, away, moved }: Cell)}
	{@const week = slot.week === 'odd' ? '奇' : slot.week === 'even' ? '偶' : null}
	<svelte:element
		this={courseHref ? 'a' : 'div'}
		class="course"
		class:live
		class:offweek={!meets || !!off || !!away}
		title={meets ? undefined : '今週はありません'}
		href={courseHref?.(course.id)}
		style:--c={courseColor(course.color)}
		style:--progress={live ? `${live.progress * 100}%` : undefined}
	>
		<!-- Recreated when the title changes, since wrapTitle replaces the text it was given -->
		{#key course.title}
			<span class="title" use:wrapTitle={course.title}>{course.title}</span>
		{/key}
		{#if live}<span class="left">あと{live.left}分</span>{/if}
		{#if off}<span class="cancel">休み {monthDay(off)}</span>{:else if away}<span class="cancel">振替 {monthDay(away)}</span>{:else if moved}<span class="cancel moved">振替 {monthDay(moved)}</span>{:else if cancel}<span class="cancel">休講 {monthDay(cancel)}</span>{:else if maybe}<span class="cancel maybe" title="{monthDay(maybe)}に休講と入れている人がいます">休講かも</span>{/if}
		{#if off || away || moved || cancel || maybe}
			<!-- The room gives way to the label, so the name still fits -->
		{:else if slot.room && week}
			<span class="room"><b class="week" aria-label="{week}数週">{week}</b>{slot.room}</span>
		{:else if slot.room || week}
			<span class="room">{slot.room ?? `${week}数週`}</span>
		{/if}
	</svelte:element>
{/snippet}

<div class="grid" class:stagger style:--days={days.length} style:--periods={periods.length}>
	{#each days as day, i (day)}
		{@const off = offDay(day)}
		<svelte:element
			this={dayHref ? 'a' : 'div'}
			class="day"
			class:off
			href={dayHref?.(day)}
			title={off ? `${monthDay(dateOf(day))} ${off.label}` : undefined}
			style:grid-column={i + 2}
			style:--n={i}
		>
			{#if isToday(day)}
				<span class="today-mark" aria-label="{DAY_NAMES[day]}曜日（今日）">{DAY_NAMES[day]}</span>
			{:else}
				{DAY_NAMES[day]}
			{/if}
			{#if off}<span class="off-mark">休</span>{/if}
		</svelte:element>
	{/each}

	{#each periods as p, i (p.number)}
		<div class="period" class:now={todayShown && isNow(p.start, p.end)} style:grid-row={i + 2} style:--n={i}>
			<span class="number">{p.number}</span>
			<span class="start">{time(p.start)}</span>
			<span class="end">{time(p.end)}</span>
		</div>
		{#each days as day, j (day)}
			<svelte:element
				this={slotHref ? 'a' : 'div'}
				class="slot"
				class:today={isToday(day)}
				href={slotHref?.(day, p.number)}
				aria-label={slotHref ? slotLabel(day, p.number) : undefined}
				style:grid-row={i + 2}
				style:grid-column={j + 2}
				style:--n={i + j}
			></svelte:element>
		{/each}
	{/each}

	{#each stacks as stack (`${stack.col}-${stack.row}`)}
		{#if stack.cells.length === 1}
			<div class="place" style:grid-row="{stack.row} / span {stack.span}" style:grid-column={stack.col} style:--n={stack.row + stack.col - 4}>
				{@render course(stack.cells[0])}
			</div>
		{:else}
			<div class="place stacked" style:grid-row="{stack.row} / span {stack.span}" style:grid-column={stack.col} style:--n={stack.row + stack.col - 4}>
				{#each stack.cells as cell (`${cell.course.id}-${cell.slot.period}`)}
					{@render course(cell)}
				{/each}
			</div>
		{/if}
	{/each}
</div>

<style>
	/* Each cell fades in a little after the one above and to the left of it */
	@media (prefers-reduced-motion: no-preference) {
		.grid.stagger > :global(*) {
			animation: cell-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
			animation-delay: calc(var(--n, 0) * 20ms);
		}
	}

	@keyframes cell-in {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
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
		gap: 2px;
		font-size: 12px;
		font-weight: 500;
		color: var(--ink-sub);
		text-decoration: none;
	}

	.day.off {
		color: var(--shu);
	}

	.off-mark {
		font-size: 10px;
		font-weight: 700;
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

	.slot.today {
		background: var(--slot-today);
	}

	/* Offline, a course can't be added: the empty cells are only outlines (not dimmed, which
	   would paint them over the courses next to them) */
	:global(:root[data-offline]) .slot {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}

	/* A tap presses the cell in a little */
	@media (prefers-reduced-motion: no-preference) {
		a.slot,
		a.course {
			transition: transform 0.12s ease;
		}

		a.slot:active,
		a.course:active {
			transform: scale(0.95);
		}
	}

	.place {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.stacked {
		gap: 2px;
	}

	.course {
		flex: 1 1 0;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		/* 3px, not the mock's 4px, so five characters (ドイツ語Ⅰ) fit on a phone */
		padding: 5px 3px;
		border-radius: 8px;
		background: var(--c);
		color: var(--ink);
		text-decoration: none;
		overflow: hidden;
	}

	.stacked .course {
		padding-top: 3px;
		padding-bottom: 3px;
		gap: 1px;
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
		/* A word too long for the cell still never starts a line with ー or a small kana */
		line-break: strict;
	}

	.cancel {
		flex-shrink: 0;
		margin-top: auto;
		align-self: center;
		padding: 1px 4px;
		border-radius: 5px;
		letter-spacing: -0.02em;
		background: var(--ink);
		color: var(--surface);
		font-size: 10px;
		font-weight: 700;
		white-space: nowrap;
	}

	.cancel.moved {
		background: var(--shu);
		color: #fff;
	}

	.cancel.maybe {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--ink);
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

	.cancel + .room {
		margin-top: 0;
	}

	/* Alternate weeks: 奇 or 偶 leads the room tag */
	.week {
		margin-right: 3px;
		font-weight: 700;
	}

	.course.offweek {
		opacity: 0.5;
	}
</style>
