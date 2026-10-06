<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ReportForm from '$lib/components/ReportForm.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { sharedChanges, sharedFields, sharedSource, slotText, type SharedValuesLike } from '$lib/shared-changes';
	import { WARNING_MAX } from '$lib/moderation';
	import { tokyoTime } from '$lib/time';

	let { data, form } = $props();

	// What an edit changed, field by field
	function changes(diff: { before: unknown; after: unknown }) {
		const after = sharedFields(diff.after as SharedValuesLike);
		if (!diff.before) return [{ label: '最初の登録', text: `${after['授業名']} · ${after['曜日・時限']}` }];
		return sharedChanges(diff.before as SharedValuesLike, diff.after as SharedValuesLike).map((c) => ({ label: c.label, text: `${c.before} → ${c.after}` }));
	}

	const when = (d: Date) => {
		const t = tokyoTime(d.getTime());
		const m = Math.floor(t.minutes);
		return `${t.date.replace(/-/g, '/')} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
	};

	const current = $derived(sharedFields(data.course.values));
	// The same page with another page of the history (keeps ?back=)
	function historyPage(n: number) {
		const url = new URL(page.url);
		if (n > 1) url.searchParams.set('page', String(n));
		else url.searchParams.delete('page');
		return url.pathname + url.search;
	}
	// The merge picker: ?merge= is the search, ?into= the course chosen (keeps ?back=)
	function mergeHref(query: string, into?: string) {
		const url = new URL(page.url);
		url.searchParams.delete('merged');
		url.searchParams.set('merge', query);
		if (into) url.searchParams.set('into', into);
		else url.searchParams.delete('into');
		return url.pathname + url.search;
	}
	let reporting = $state(false);
	// The delete's warning to the creator, on unless the admin unticks it
	let warn = $state(true);
	const warningDraft = $derived(`授業「${data.course.values.title}」を、不適切な内容であると判断して削除しました。くり返すと利用を止めることがあります。`);
</script>

<svelte:head>
	<title>{data.course.values.title}（みんなの授業データ） · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="みんなの授業データ" back={data.back} />

	<section class="ui-section">
		<div class="card">
			<h2>{data.course.values.title}</h2>
			<dl>
				<dt>先生</dt>
				<dd>{current['先生']}</dd>
				<dt>曜日・時限</dt>
				<dd>{current['曜日・時限']}</dd>
				<dt>教室</dt>
				<dd>{current['教室']}</dd>
				{#if data.course.terms.length}
					<dt>学期</dt>
					<dd>{data.course.year}年度 {data.course.terms.join('・')}</dd>
				{/if}
				<dt>出どころ</dt>
				<dd>{sharedSource(data.course)}</dd>
			</dl>
			<p class="meta">
				{data.course.university} · {data.course.source === 'syllabus' ? 'シラバスから' : 'みんなの登録'} · {data.users}人が同期中{data.isAdmin ? `・使用中 ${data.using}人` : ''}
			</p>
			{#if data.isAdmin && data.course.source === 'user'}
				<p class="meta">
					作成者：{#if data.creator}<a href="/admin/users/{data.creator.id}">{data.creator.nickname ?? '（名前なし）'}</a>{:else}（退会した人）{/if}
				</p>
			{/if}
		</div>
		<p class="ui-note">
			この授業を同期していて在籍確認済みの人と運営が直せます。直した内容は同期しているみんなに反映され、履歴から元に戻せます。{data.canEdit
				? ''
				: 'まちがいを見つけたら、報告してください。'}
		</p>
		<button class="btn" type="button" onclick={() => (reporting = true)}><Icon name="flag" size={18} />まちがい・荒らしを報告する</button>
	</section>

	{#if data.isAdmin}
		<section class="ui-section">
			<h2 class="ui-section-title">運営が直す</h2>
			<form class="admin-edit" method="POST" action="?/edit" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<input type="hidden" name="version" value={data.course.version} />
				<label class="field">
					授業名
					<input name="title" value={data.course.values.title} maxlength="60" required />
				</label>
				<label class="field">
					先生（1行に1人）
					<textarea name="teachers" rows="2">{data.course.values.teachers.join('\n')}</textarea>
				</label>
				{#each data.course.values.slots as slot, i (i)}
					<label class="field">
						教室（{slotText(slot)}）
						<input name="room" value={slot.room ?? ''} maxlength="20" />
					</label>
				{/each}
				<p class="ui-note">同期しているみんなの時間割に反映され、履歴に残ります。</p>
				{#if form?.message && form.edit}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form?.edited}<p class="done" role="status">直しました。</p>{/if}
				<button class="btn btn-primary" type="submit">直す</button>
			</form>
		</section>

		{#if data.merge}
			<section class="ui-section">
				<h2 class="ui-section-title">ほかの授業と同期させる</h2>
				{#if page.url.searchParams.get('merged')}<p class="done" role="status">同期させました。この授業に、もう1つの授業をまとめました。</p>{/if}
				{#if data.merge.target}
					{@const target = data.merge.target}
					<div class="merge">
						<p>「{data.course.values.title}」を「{target.values.title}」にまとめます。</p>
						<dl>
							<dt>まとめる授業</dt>
							<dd>{sharedFields(data.course.values)['授業名']} · {data.course.terms.join('・') || '学期なし'} · {sharedFields(data.course.values)['先生']} · {sharedFields(data.course.values)['曜日・時限']}</dd>
							<dt>まとめ先</dt>
							<dd>{sharedFields(target.values)['授業名']} · {target.terms.join('・') || '学期なし'} · {sharedFields(target.values)['先生']} · {sharedFields(target.values)['曜日・時限']}</dd>
						</dl>
						<ul>
							<li>この授業を使っている{data.merge.target.people}人が、まとめ先と同期します。授業名・先生・教室・コマも、まとめ先の内容になります</li>
							{#if target.both}<li>両方を入れている{target.both}人は、この授業が「自分だけで使う」に変わって、今の内容のまま残ります</li>{/if}
							<li>この授業は消えます。変更の履歴も消えて、元に戻せません</li>
						</ul>
						<form method="POST" action="?/merge" use:enhance>
							<input type="hidden" name="back" value={data.back} />
							<input type="hidden" name="into" value={target.id} />
							<input type="hidden" name="into_version" value={target.version} />
							<input type="hidden" name="version" value={data.course.version} />
							{#if form?.message && form.merge}<p class="error" role="alert">{form.message}</p>{/if}
							<button class="btn btn-primary" type="submit">まとめる</button>
							<a class="btn" href={mergeHref(data.merge.query ?? '')}>やめる</a>
						</form>
					</div>
				{:else if data.merge.query === null}
					<p class="ui-note">名前が少し違うだけで別の授業になっているときに、同じ大学・年度・学期の授業にまとめられます。</p>
					<a class="btn" href={mergeHref('')}>まとめ先をさがす</a>
				{:else}
					<form method="GET" role="search" class="merge-search">
						<input type="hidden" name="back" value={data.back} />
						<input type="search" name="merge" value={data.merge.query} placeholder="まとめ先の授業名・先生・授業コード" maxlength="50" aria-label="まとめ先をさがす" />
						<button class="btn" type="submit">さがす</button>
					</form>
					<div class="ui-list">
						{#each data.merge.candidates as c (c.id)}
							{@const v = sharedFields(c.values)}
							<a class="candidate" href={mergeHref(data.merge.query, c.id)}>
								<b>{v['授業名']}</b>
								<span>{c.terms.join('・') || '学期なし'} · {v['先生']} · {v['曜日・時限']} · {c.source === 'syllabus' ? 'シラバス · ' : ''}同期中 {c.users}人・使用中 {c.using}人</span>
							</a>
						{:else}
							<p class="ui-note">見つかりませんでした。</p>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<section class="ui-section">
			<h2 class="ui-section-title">削除</h2>
			{#if data.removal}
				<ul class="ui-note reach">
					{#if data.removal.creatorHas}<li>作成者の時間割からは消えます</li>{/if}
					{#if data.removal.others}<li>ほかに入れている{data.removal.others}人は、今の内容のまま「自分だけで使う」に変わります。メモや課題は残ります</li>{/if}
					<li>変更の履歴も消えて、元に戻せません。この授業への報告は対応済みになります</li>
				</ul>
			{/if}
			<form
				class="remove"
				method="POST"
				action="?/remove"
				use:enhance={async ({ cancel }) => {
					if (!(await ask({ message: `「${data.course.values.title}」を削除します。元に戻せません`, ok: '削除する', danger: true }))) return cancel();
					return async ({ update }) => update({ reset: false });
				}}
			>
				<input type="hidden" name="version" value={data.course.version} />
				{#if data.creator}
					<label class="check">
						<input type="checkbox" name="warn" bind:checked={warn} />
						作成者に警告を送る
					</label>
					{#if warn}
						<label class="field">
							警告の文
							<textarea name="warning" rows="3" maxlength={WARNING_MAX}>{warningDraft}</textarea>
						</label>
					{/if}
				{/if}
				{#if form?.message && form.remove}<p class="error" role="alert">{form.message}</p>{/if}
				<button class="btn danger" type="submit">この授業を削除する</button>
			</form>
		</section>
	{/if}

	<section class="ui-section">
		<h2 class="ui-section-title">変更の履歴</h2>
		{#if form?.message && !form.edit && !form.merge && !form.remove}<p class="error" role="alert">{form.message}</p>{/if}
		{#if form?.restored}<p class="done" role="status">元に戻しました。</p>{/if}
		<div class="ui-list">
			{#each data.edits as edit, i (edit.id)}
				<div class="edit">
					<div class="edit-head">
						<span class="date">{when(edit.createdAt)}</span>
						{#if data.page === 1 && i === 0}<span class="now">いまの内容</span>{/if}
						{#if edit.by}
							<span class="by">
								{#if edit.by.id}<a href="/admin/users/{edit.by.id}">{edit.by.nickname ?? '（名前なし）'}</a>{:else}（退会した人）{/if}
							</span>
						{/if}
					</div>
					{#each changes(edit.diff) as change (change.label)}
						<p class="change"><b>{change.label}</b>{change.text}</p>
					{/each}
					{#if data.canEdit && (data.page > 1 || i > 0)}
						<form
							method="POST"
							action="?/restore"
							use:enhance={async ({ cancel }) => {
								if (!(await ask({ message: 'この変更のあとの内容に戻します。同期しているみんなの時間割も変わります', ok: '戻す' }))) return cancel();
							}}
						>
							<input type="hidden" name="edit" value={edit.id} />
							<input type="hidden" name="version" value={data.course.version} />
							<button class="small" type="submit"><Icon name="history" size={16} />この内容に戻す</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
		{#if data.page > 1 || data.more}
			<nav class="pages" aria-label="履歴のページ">
				{#if data.page > 1}<a href={historyPage(data.page - 1)}>新しい変更へ</a>{/if}
				{#if data.more}<a class="older" href={historyPage(data.page + 1)}>もっと前の変更</a>{/if}
			</nav>
		{/if}
		<p class="ui-note">{data.isAdmin ? 'だれが直したかは、運営にだけ表示しています。' : 'だれが直したかは表示しません。'}</p>
	</section>
</div>

<Sheet bind:open={reporting} title="授業のデータを報告">
	<ReportForm reasons={data.reportReasons} action="?/report" done={() => (reporting = false)} />
</Sheet>

<style>
	.pages {
		display: flex;
		gap: 12px;
		padding: 10px 2px 0;
		font-size: 14px;
	}

	.pages a {
		color: var(--accent-text);
	}

	.older {
		margin-left: auto;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 20px;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}

	dt {
		color: var(--ink-sub);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.edit {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 14px;
	}

	.edit-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.date {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.now {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--course-green);
		font-size: 11px;
		font-weight: 700;
	}

	.change {
		display: flex;
		flex-direction: column;
		margin: 0;
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.change b {
		font-size: 11px;
		color: var(--ink-soft);
	}

	.edit form {
		align-self: flex-start;
		margin-top: 4px;
	}

	.small {
		height: 34px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border: 1px solid var(--line-bold);
		border-radius: 9px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.danger {
		border-color: var(--accent-text);
		background: var(--accent-text);
		color: var(--surface);
	}

	.merge {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 14px;
		line-height: 1.7;
	}

	.merge p,
	.merge ul {
		margin: 0;
	}

	.merge ul {
		padding-left: 20px;
	}

	.merge dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}

	.merge dt {
		color: var(--ink-sub);
	}

	.merge dd {
		margin: 0;
	}

	.merge form {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.merge form .error {
		flex-basis: 100%;
	}

	.merge-search {
		display: flex;
		gap: 8px;
	}

	.merge-search input[type='search'] {
		flex: 1 1 0;
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

	.candidate {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.candidate + .candidate {
		border-top: 1px solid var(--slot);
	}

	.candidate span {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.admin-edit {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	textarea {
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		line-height: 1.6;
		resize: vertical;
	}

	.done {
		margin: 0;
		font-size: 13px;
		color: var(--ink-soft);
	}

	.by {
		margin-left: auto;
		font-size: 12px;
	}

	.by a,
	.meta a {
		color: var(--accent-text);
	}

	.reach {
		margin: 0;
		padding-left: 18px;
	}

	.remove {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.check {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--ink);
	}
</style>
