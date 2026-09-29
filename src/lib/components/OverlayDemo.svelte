<script lang="ts">
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { DAY_NAMES } from '$lib/courses';
	import { iconOf } from '$lib/icons';
	import { classFill } from '$lib/overlay';

	// A picture of the コマを重ねる screen with made-up people and classes (nothing is read from
	// anywhere). It uses the same icon, color and class look as the screen (src/routes/overlay).
	const me = { id: 'demo-me', nickname: '自分', icon: { color: 'shu', text: '自' } };
	const ao = { id: 'demo-ao', nickname: 'あお', icon: { color: 'ai', text: 'あ' } };
	const haru = { id: 'demo-haru', nickname: 'はる', icon: { color: 'midori', text: 'は' } };
	const friends = [ao, haru];
	const colorOf = (u: typeof me) => iconOf(u).hex;

	const days = [1, 2, 3, 4, 5];
	const periods = [1, 2, 3, 4];
	// weekday-period: title and who has it
	const classes: Record<string, { title: string; who: (typeof me)[] }> = {
		'1-1': { title: '英語', who: [me, ao] },
		'1-3': { title: '統計', who: [haru] },
		'2-2': { title: '情報', who: [me, ao, haru] },
		'2-4': { title: '体育', who: [ao] },
		'3-1': { title: '統計', who: [me, haru] },
		'3-3': { title: '英語', who: [haru] },
		'4-2': { title: '体育', who: [me] },
		'4-3': { title: '情報', who: [ao] },
		'5-1': { title: '英語', who: [haru] },
		'5-4': { title: '統計', who: [me, ao] }
	};
	const free = days.flatMap((d) => {
		const ps = periods.filter((p) => !classes[`${d}-${p}`]);
		return ps.length ? [[d, ps] as const] : [];
	});
</script>

<div class="demo" aria-hidden="true">
	<div class="chips">
		<span class="chip on" style:--p={colorOf(me)}><UserIcon user={me} size={24} short />自分</span>
		{#each friends as f (f.id)}
			<span class="chip on" style:--p={colorOf(f)}><UserIcon user={f} size={24} short />{f.nickname}</span>
		{/each}
	</div>

	<div class="grid">
		{#each days as d, i (d)}<span class="day" style:grid-column={i + 2}>{DAY_NAMES[d]}</span>{/each}
		{#each periods as p, r (p)}
			<span class="period" style:grid-row={r + 2}>{p}</span>
			{#each days as d, c (d)}
				{@const cls = classes[`${d}-${p}`]}
				<span class="cell" class:free={!cls} style:grid-row={r + 2} style:grid-column={c + 2}>
					{#if cls}
						<span class="course" style:background={classFill(cls.who.map(colorOf))}>
							<span class="title">{cls.title}</span>
							<span class="people">{#each cls.who as x (x.id)}<UserIcon user={x} size={16} short />{/each}</span>
						</span>
					{/if}
				</span>
			{/each}
		{/each}
	</div>

	<div class="free-card">
		<h4>みんな空いてるコマ</h4>
		{#each free as [d, ps] (d)}
			<div class="free-day">
				<span class="free-label">{DAY_NAMES[d]}</span>
				<span class="free-list">{#each ps as p (p)}<span class="free-chip">{p}限</span>{/each}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.demo {
		padding: 12px 0 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--bg);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 10px 10px;
	}

	.chip {
		height: 36px;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px 0 6px;
		border: 1px solid var(--p);
		border-radius: 18px;
		background: color-mix(in srgb, var(--p) 16%, var(--surface));
		color: var(--ink);
		font-size: 13px;
		font-weight: 700;
	}

	.grid {
		display: grid;
		grid-template-columns: 24px repeat(5, minmax(0, 1fr));
		grid-template-rows: 20px repeat(4, 62px);
		gap: 3px;
		padding: 0 8px;
	}

	.day {
		grid-row: 1;
		text-align: center;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.period {
		grid-column: 1;
		padding-top: 5px;
		text-align: center;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 13px;
	}

	.cell {
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		padding: 3px;
		overflow: hidden;
		border: 1px solid var(--slot);
		border-radius: 8px;
		background: var(--slot);
	}

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
		font-size: 10px;
		font-weight: 700;
		line-height: 1.3;
	}

	.people {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}

	.free-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 12px 10px 0;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.free-card h4 {
		margin: 0 0 2px;
		font-size: 13px;
		font-weight: 700;
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
</style>
