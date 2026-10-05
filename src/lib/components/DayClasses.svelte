<script lang="ts">
	import Segmented from '$lib/components/Segmented.svelte';
	import { spanLabel, type CalendarDay } from '$lib/calendar';
	import { DAY_NAMES, courseColor, periodLabel } from '$lib/courses';
	import { classesOn, type DayCourse } from '$lib/day-classes';
	import { addDays, monthDay, weekdayOf } from '$lib/time';

	// Today's or tomorrow's classes, above the timetable
	let {
		today,
		terms,
		periods,
		courses,
		calendar,
		href,
		calendarHref
	}: {
		today: string;
		terms: { id: string; startDate: string | null; endDate: string | null }[];
		periods: { number: number; start: string; end: string }[];
		courses: DayCourse[];
		calendar: CalendarDay[];
		href: (courseId: string) => string;
		calendarHref: string;
	} = $props();

	const options = [
		{ id: 'today', label: '今日' },
		{ id: 'tomorrow', label: '明日' }
	] as const;
	let which = $state<'today' | 'tomorrow'>('today');
	const date = $derived(which === 'today' ? today : addDays(today, 1));
	const day = $derived(classesOn(date, { terms, periods, courses, calendar }));
	const time = (hhmm: string | null) => hhmm?.replace(/^0/, '') ?? '';
	const periodNumbers = $derived(periods.map((p) => p.number));
</script>

<section class="day-classes">
	<div class="head">
		<Segmented {options} bind:value={which} label="見る日" />
		<span class="date">{monthDay(date)}（{DAY_NAMES[weekdayOf(date)]}）</span>
		<a class="calendar" href={calendarHref}>日程</a>
	</div>

	{#if day.off || day.exam}
		<p class="badge" class:exam={!day.off}>
			{day.off ? day.off.label : `${day.exam?.label}（${day.exam ? spanLabel(day.exam) : ''}）`}
		</p>
	{/if}

	{#if day.items.length}
		<div class="list">
			{#each day.items as c, i (`${c.courseId}-${c.period}-${c.status}-${c.move?.id ?? i}`)}
				<a class="row" class:gone={c.status === 'cancel' || c.status === 'away'} href={href(c.courseId)} style:--c={courseColor(c.color)}>
					<span class="when"><b>{periodLabel(c.period, c.span, periodNumbers)}</b>{time(c.start)}</span>
					<span class="text">
						<span class="title">{c.title}</span>
						{#if c.room}<span class="sub">{c.room}</span>{/if}
					</span>
					{#if c.status === 'cancel'}
						<span class="tag">休講</span>
					{:else if c.status === 'away' && c.move}
						<span class="tag">振替 → {monthDay(c.move.toDate)} {c.move.period}限</span>
					{:else if c.status === 'moved'}
						<span class="tag moved">振替</span>
					{/if}
				</a>
			{/each}
		</div>
	{:else if !day.off}
		<p class="empty">授業はありません。</p>
	{/if}
</section>

<style>
	.day-classes {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 4px 16px 12px;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.date {
		font-size: 13px;
		color: var(--ink-sub);
	}

	.calendar {
		margin-left: auto;
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		font-size: 13px;
		text-decoration: none;
	}

	.badge {
		align-self: flex-start;
		margin: 0;
		padding: 3px 10px;
		border-radius: 8px;
		background: var(--shu);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
	}

	.badge.exam {
		background: var(--ink);
		color: var(--surface);
	}

	.list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		overflow: hidden;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-left: 4px solid var(--c);
		color: var(--ink);
		text-decoration: none;
	}

	.row + .row {
		border-top: 1px solid var(--line);
	}

	.row.gone .text {
		opacity: 0.5;
		text-decoration: line-through;
	}

	.when {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 40px;
		font-size: 11px;
		color: var(--ink-sub);
	}

	.when b {
		font-size: 13px;
		color: var(--ink);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.title {
		font-size: 14px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.tag {
		flex-shrink: 0;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--ink);
		color: var(--surface);
		font-size: 11px;
		font-weight: 700;
	}

	.tag.moved {
		background: var(--shu);
		color: #fff;
	}

	.empty {
		margin: 0;
		font-size: 13px;
		color: var(--ink-sub);
	}
</style>
