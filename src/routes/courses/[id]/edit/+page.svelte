<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import CourseForm from '$lib/components/CourseForm.svelte';
	import { actionHref, courseHref } from '$lib/courses';

	import type { ActionData, PageData } from './$types';

	// onsaved and onback: shown beside the timetable on a wide screen (the home page)
	let { data, form, onsaved, onback }: { data: PageData; form?: ActionData; onsaved?: () => unknown; onback?: () => unknown } = $props();
</script>

<svelte:head>
	<title>授業を編集 · コマあわせ</title>
</svelte:head>

<CourseForm
	heading="授業を編集"
	backHref={courseHref(data.course.id, data.termParam)}
	action={actionHref('save', data.termParam)}
	sync={{
		// Linked courses can still be switched to 自分だけで使う; new sharing needs an enrollment check
		canSync: data.sharedAccess === 'ok' || !!data.shared,
		locked: data.sharedAccess === 'need-verify' || data.sharedAccess === 'unsupported' ? data.sharedAccess : null,
		year: data.timetable.year,
		shared: data.shared,
		canEdit: data.canEditShared,
		fixed: data.fixedBySyllabus
	}}
	initial={data.course}
	terms={data.terms}
	periods={data.periods}
	others={data.others}
	universityId={data.timetable.universityId}
	message={form?.message}
	{onsaved}
	{onback}
>
	{#snippet notice()}
		{#if data.found}
			<div class="found">
				<span class="found-title">シラバスにこの授業がありました</span>
				<span class="found-detail">{data.found.title}{data.found.detail ? ` · ${data.found.detail}` : ''}</span>
				<span class="found-note">つなぐと、授業名や先生がシラバスの内容になり、授業概要と回ごとの授業内容がメモに入ります。色・メモ・課題はそのままです。</span>
				<button class="btn" type="submit" formaction={actionHref('link', data.termParam)} formnovalidate>シラバスとつなぐ</button>
			</div>
		{/if}
	{/snippet}
</CourseForm>

<form
	class="delete"
	method="POST"
	action={actionHref('delete', data.termParam)}
	use:enhance={async ({ cancel }) => {
		if (!(await ask({ message: `「${data.course.title}」を時間割から消します。メモや課題も消えます。`, ok: '消す', danger: true }))) return cancel();
	}}
>
	<button class="btn" type="submit">この授業を消す</button>
</form>

<style>
	.found {
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--course-blue);
	}

	.found-title {
		font-weight: 700;
		font-size: 14px;
	}

	.found-detail {
		font-size: 14px;
	}

	.found-note {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.found .btn {
		justify-self: start;
	}

	.delete {
		max-width: 480px;
		margin: 0 auto;
		padding: 0 16px 40px;
		box-sizing: border-box;
	}

	.btn {
		width: 100%;
		color: var(--accent-text);
	}
</style>
