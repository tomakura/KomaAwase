<script lang="ts">
	import CourseForm from '$lib/components/CourseForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>授業を追加 · コマあわせ</title>
</svelte:head>

<CourseForm
	heading="授業を追加"
	backHref={data.backHref}
	sync={data.sync}
	initial={data.initial}
	terms={data.terms}
	periods={data.periods}
	others={data.others}
	message={form?.message}
/>
