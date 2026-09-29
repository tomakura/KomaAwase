<script lang="ts">
	import { enhance } from '$app/forms';
	import CourseForm from '$lib/components/CourseForm.svelte';
	import { actionHref, courseHref } from '$lib/courses';

	let { data, form } = $props();
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
		canEdit: data.canEditShared
	}}
	initial={data.course}
	terms={data.terms}
	periods={data.periods}
	others={data.others}
	message={form?.message}
/>

<form
	class="delete"
	method="POST"
	action={actionHref('delete', data.termParam)}
	use:enhance={({ cancel }) => {
		if (!confirm(`「${data.course.title}」を時間割から消します。メモや課題も消えます。`)) cancel();
	}}
>
	<button class="btn" type="submit">この授業を消す</button>
</form>

<style>
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
