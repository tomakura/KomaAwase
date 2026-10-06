<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { DAY_NAMES } from '$lib/courses';
	import { slotGroups } from '$lib/slot-groups';

	let { data } = $props();

	const slotText = (s: { weekday: number; period: number; span: number }) =>
		`${DAY_NAMES[s.weekday]}${s.period}限${s.span > 1 ? `〜${s.period + s.span - 1}限` : ''}`;
	const back = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	const groups = $derived(slotGroups(data.results, { weekday: data.weekday, period: data.period }));
</script>

<svelte:head>
	<title>授業の管理 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="授業の管理" back="/admin" />

	<div class="body">
		{#if data.university === null}
			<p class="ui-note">まだ、みんなの授業データはありません。</p>
		{:else}
			<form method="GET" role="search">
				<div class="pick">
					<label>
						大学
						<select name="u" value={data.university}>
							{#each data.universities as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
						</select>
					</label>
					<label>
						年度
						<select name="y" value={data.year}>
							{#each data.years as y (y)}<option value={y}>{y}年度</option>{/each}
						</select>
					</label>
				</div>
				<div class="pick">
					<label>
						学期
						<select name="t" value={data.term}>
							<option value="">すべて</option>
							{#each data.terms as t (t)}<option value={t}>{t}</option>{/each}
						</select>
					</label>
					<label class="check">
						<input type="checkbox" name="z" value="1" checked={data.unused} />
						使用中0人だけ
					</label>
				</div>
				<div class="pick">
					<label>
						曜日
						<select name="d" value={data.weekday}>
							<option value={0}>すべて</option>
							{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAY_NAMES[d]}曜</option>{/each}
						</select>
					</label>
					<label>
						時限
						<select name="p" value={data.period}>
							<option value={0}>すべて</option>
							{#each data.periods as p (p)}<option value={p}>{p}限</option>{/each}
						</select>
					</label>
				</div>
				<div class="pick">
					<input type="search" name="q" value={data.q} placeholder="授業名・先生・授業コード" maxlength="50" aria-label="授業をさがす" />
					<button class="btn btn-primary" type="submit">さがす</button>
				</div>
			</form>

			{#if data.removed}<p class="done" role="status">授業を削除しました。</p>{/if}
			{#each groups as g (g.key)}
				<section class="group">
					<h2>{g.label}<span>{g.items.length}件</span></h2>
					<div class="ui-list">
						{#each g.items as c (c.id)}
							<a class="course" class:unused={c.using === 0} href="/shared/{c.id}?back={back}">
								<b>{c.title}{#if c.using === 0}<em>使用中 0人</em>{/if}</b>
								<span>
									{c.teachers.join('・') || '先生なし'} · {c.slots.map(slotText).join('、') || '曜日・時限なし'} · {c.source === 'syllabus' ? 'シラバス · ' : ''}同期中 {c.users}人・使用中 {c.using}人
								</span>
							</a>
						{/each}
					</div>
				</section>
			{:else}
				<p class="ui-note">見つかりませんでした。</p>
			{/each}
			{#if data.results.length >= data.limit}<p class="ui-note">先頭の{data.limit}件です。絞りこんでください。</p>{/if}
		{/if}
	</div>
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 6px 16px 32px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pick {
		display: flex;
		gap: 8px;
	}

	input[type='search'] {
		flex: 1 1 0;
	}

	.pick label {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	select {
		width: 100%;
	}

	select,
	input[type='search'] {
		min-width: 0;
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

	.course {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.course + .course {
		border-top: 1px solid var(--slot);
	}

	.course b {
		font-size: 15px;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.group h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 6px 2px 0;
		font-size: 14px;
		font-weight: 700;
	}

	.group h2 span {
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.done {
		margin: 0;
		font-size: 13px;
		color: var(--ink-soft);
	}

	/* Nobody has it in a timetable */
	.course.unused {
		border-left: 4px solid var(--accent-text);
		background: color-mix(in srgb, var(--accent-text) 10%, var(--surface));
	}

	.course em {
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--accent-text);
		color: var(--surface);
		font-size: 11px;
		font-style: normal;
		font-weight: 700;
	}

	.pick .check {
		flex-direction: row;
		align-items: center;
		align-self: flex-end;
		gap: 8px;
		height: 44px;
		font-size: 14px;
		color: var(--ink);
	}

	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--ink);
	}

	.course span {
		font-size: 12px;
		color: var(--ink-sub);
	}
</style>
