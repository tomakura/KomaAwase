<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SharedLock from '$lib/components/SharedLock.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { DAY_NAMES, periodLabel, timetableHref, weekLabel } from '$lib/courses';

	let { data } = $props();

	const periodNumbers = $derived(data.periods.map((p) => p.number));
	const slotName = $derived(data.slot ? `${DAY_NAMES[data.slot.weekday]}曜${data.slot.period}限` : null);

	// Links from here keep the slot and term; a chosen course is added with ?shared=
	function newCourseHref(shared?: string) {
		const params = new URLSearchParams();
		if (data.termParam) params.set('term', data.termParam);
		if (data.slot) {
			params.set('day', String(data.slot.weekday));
			params.set('period', String(data.slot.period));
		}
		if (shared) params.set('shared', shared);
		return `/courses/new?${params}`;
	}

	// At the tapped slot: 佐藤・鈴木 · B-203 · 木1限も. Found by name elsewhere: 佐藤 · 木1限・金2限
	function details(r: (typeof data.results)[number]) {
		const here = r.slots.find((s) => s.weekday === data.slot?.weekday && s.period === data.slot?.period);
		const others = r.slots
			.filter((s) => s !== here)
			.map((s) => `${DAY_NAMES[s.weekday]}${periodLabel(s.period, s.span, periodNumbers)}${weekLabel(s.week) ? `（${weekLabel(s.week)}）` : ''}`)
			.join('・');
		return [r.teachers.join('・'), here?.room, others && (here ? `${others}も` : others)]
			.filter(Boolean)
			.join(' · ');
	}

	// svelte-ignore state_referenced_locally
	let query = $state(data.q);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function search(delay: number) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const url = new URL(page.url);
			if (query.trim()) url.searchParams.set('q', query.trim());
			else url.searchParams.delete('q');
			goto(url, { keepFocus: true, replaceState: true, noScroll: true });
		}, delay);
	}
</script>

<svelte:head>
	<title>授業をさがす · コマあわせ</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={timetableHref(data.termParam)}>
			<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			<span class="visually-hidden">もどる：</span>
			<h1>授業を追加</h1>
		</a>
		{#if data.slot}
			<span class="slot">{DAY_NAMES[data.slot.weekday]}曜 {data.slot.period}限</span>
		{/if}
	</header>

	<div class="body">
		{#if data.access !== 'ok'}
			<SharedLock access={data.access} what="みんなの授業データ" from={page.url.pathname + page.url.search} />
		{:else}
		<form
			role="search"
			onsubmit={(e) => {
				e.preventDefault();
				search(0);
			}}
		>
			<label class="search">
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="11" cy="11" r="6.5" />
					<path d="M16 16l4.5 4.5" />
				</svg>
				<input
					type="search"
					bind:value={query}
					oninput={() => search(300)}
					aria-label="授業をさがす"
					placeholder="授業名・先生・授業コードでさがす"
					maxlength="50"
					autocomplete="off"
				/>
			</label>
		</form>

		<section>
			<div class="section-head">
				<h2>{data.q ? `「${data.q}」の授業` : slotName ? `${slotName}の授業` : '授業'}</h2>
				{#if data.universityName}
					<span class="scope">
						{data.universityName} · {data.year}年度{!data.q && data.termName ? ` ${data.termName}` : ''}
					</span>
				{/if}
			</div>
			{#if data.results.length}
				<div class="list">
					{#each data.results as r (r.id)}
						{@const info = details(r)}
						<a href={newCourseHref(r.id)}>
							<span class="name">
								<span class="title">{r.title}</span>
								{#if r.source === 'syllabus'}
									<span class="tag syllabus">シラバス</span>
								{:else}
									<span class="tag">みんなの登録 {r.users}人</span>
								{/if}
							</span>
							{#if info}<span class="details">{info}</span>{/if}
							{#if r.friends.length}
								<span class="friends">
									{#each r.friends.slice(0, 5) as f (f.id)}<UserIcon user={f} size={20} short />{/each}
									<span class="friends-text">
										{r.friends.length > 2
											? `${r.friends[0].nickname}さんたち${r.friends.length}人`
											: `${r.friends.map((f) => f.nickname).join('さん・')}さん`}も取っています
									</span>
								</span>
							{/if}
						</a>
					{/each}
				</div>
				<p class="note">「シラバス」は大学の公開シラバス、「みんなの登録」は同じ大学の人が入れた授業です。</p>
			{:else}
				<p class="empty">
					{data.q
						? '見つかりませんでした。'
						: 'まだだれも登録していません。自分で入力すると、同じ大学の人がここから選べるようになります。'}
				</p>
			{/if}
		</section>
		{/if}

		<section>
			<h2>見つからないとき</h2>
			<a class="option" href={newCourseHref()}>
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z" />
				</svg>
				<span>自分で入力する</span>
				<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</a>
			{#if data.access === 'ok'}
				<a class="option" href="/import?back={encodeURIComponent(page.url.pathname + page.url.search)}">
					<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
						<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
						<circle cx="9" cy="10" r="1.8" />
						<path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
					</svg>
					<span>スクショからまとめて読み込む</span>
					<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
				</a>
			{/if}
		</section>
	</div>
</div>

<style>
	.page {
		max-width: 480px;
		margin: 0 auto;
		padding-bottom: 32px;
	}

	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 10px 8px 6px;
	}

	.back {
		min-width: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px 0 11px;
		color: var(--ink);
		text-decoration: none;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 20px;
	}

	.slot {
		margin: 0 12px 0 auto;
		padding: 3px 10px;
		border-radius: 8px;
		background: var(--ink);
		color: var(--surface);
		font-size: 13px;
		font-weight: 700;
	}

	svg {
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 6px 16px 0;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 46px;
		box-sizing: border-box;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink-sub);
	}

	/* 16px so iOS doesn't zoom in */
	.search input {
		flex: 1 1 0;
		min-width: 0;
		height: 40px;
		border: none;
		background: transparent;
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		outline-offset: 4px;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px;
	}

	h2 {
		margin: 0;
		padding: 0 2px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.section-head h2 {
		padding: 0;
	}

	.scope {
		font-size: 11px;
		color: var(--ink-sub);
		text-align: right;
	}

	.list {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.list a {
		min-height: 64px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		padding: 8px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.list a + a {
		border-top: 1px solid var(--slot);
	}

	.name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}

	.title {
		font-size: 15px;
		font-weight: 700;
	}

	.tag {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 700;
	}

	.tag.syllabus {
		background: var(--course-blue);
		color: var(--ink);
	}

	.details {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.friends {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
	}

	.friends-text {
		margin-left: 3px;
		font-size: 11px;
		color: var(--ink-soft);
	}

	.note,
	.empty {
		margin: 0;
		padding: 0 2px;
		font-size: 11px;
		line-height: 1.6;
		color: var(--ink-sub);
	}

	.empty {
		padding: 14px 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		font-size: 13px;
	}

	.option {
		min-height: 48px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-size: 14px;
		text-decoration: none;
	}

	.option span {
		flex-grow: 1;
	}

	.chevron {
		color: var(--ink-sub);
	}
</style>
