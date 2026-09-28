<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { DAY_NAMES, courseColor, deliveryLabel, periodLabel } from '$lib/courses';

	let { data } = $props();

	const periodNumbers = $derived(data.periods.map((p) => p.number));
	const termOrder = $derived(new Map(data.terms.map((t, i) => [t.id, i])));

	// In term order, then by the first slot
	const courses = $derived(
		data.courses.toSorted((a, b) => {
			const ta = Math.min(...a.termIds.map((id) => termOrder.get(id) ?? 99));
			const tb = Math.min(...b.termIds.map((id) => termOrder.get(id) ?? 99));
			const sa = a.slots[0] ? a.slots[0].weekday * 100 + a.slots[0].period : 9999;
			const sb = b.slots[0] ? b.slots[0].weekday * 100 + b.slots[0].period : 9999;
			return ta - tb || sa - sb || a.title.localeCompare(b.title, 'ja');
		})
	);

	function detail(course: (typeof data.courses)[number]) {
		const terms = data.terms.filter((t) => course.termIds.includes(t.id)).map((t) => t.name).join('・');
		const slots = course.slots.map((s) => `${DAY_NAMES[s.weekday]}${periodLabel(s.period, s.span, periodNumbers)}`).join('・');
		return [terms, slots || deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo)].filter(Boolean).join(' · ');
	}
</script>

<svelte:head>
	<title>時間割の管理 · コマあわせ</title>
</svelte:head>

{#snippet link(href: string, label: string, value?: string | null)}
	<a class="ui-row" {href}>
		<span>{label}</span>
		<span class="ui-row-value">{#if value}{value}{/if}<Icon name="chevron" size={16} /></span>
	</a>
{/snippet}

<div class="ui-page">
	<PageHeader title="時間割の管理" back="/more" />

	<section class="ui-section">
		<div class="ui-list">
			<div class="ui-row"><span>年度</span><span class="ui-row-value">{data.year}年度</span></div>
			{@render link('/more/university', '大学', data.universityName ?? '未設定')}
			{@render link('/more/terms', '学期の区切り', data.termsLabel)}
			{@render link('/more/periods', '時限と時刻', data.periodsLabel)}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">授業（{courses.length}件）</h2>
		{#if courses.length}
			<div class="ui-list">
				{#each courses as course (course.id)}
					<a class="course" href="/courses/{course.id}">
						<span class="bar" style:--c={courseColor(course.color)}></span>
						<span class="text">
							<span class="title">{course.title}</span>
							<span class="sub">{detail(course)}</span>
						</span>
						<Icon name="chevron" size={16} />
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty">まだ授業がありません。時間割の空いたコマをタップすると追加できます。</p>
		{/if}
	</section>
</div>

<style>
	.course {
		min-height: 56px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.course > :global(.icon) {
		color: var(--ink-sub);
	}

	.bar {
		width: 10px;
		height: 32px;
		flex-shrink: 0;
		box-sizing: border-box;
		border-radius: 4px;
		border: 1px solid color-mix(in oklab, var(--c), var(--ink) 15%);
		background: var(--c);
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
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

	.empty {
		margin: 0;
		padding: 14px 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-sub);
	}
</style>
