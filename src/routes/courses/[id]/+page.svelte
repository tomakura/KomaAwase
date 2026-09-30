<script lang="ts">
	import CourseDetail from '$lib/components/CourseDetail.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.course.title} · コマあわせ</title>
</svelte:head>

<CourseDetail {data} {form} />
