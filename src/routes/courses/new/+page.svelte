<script lang="ts">
	import CourseForm from '$lib/components/CourseForm.svelte';
	import { timetableHref } from '$lib/courses';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>授業を追加 · コマあわせ</title>
</svelte:head>

<CourseForm
	heading="授業を追加"
	backHref={timetableHref(data.termParam)}
	initial={data.initial}
	terms={data.terms}
	periods={data.periods}
	message={form?.message}
/>
