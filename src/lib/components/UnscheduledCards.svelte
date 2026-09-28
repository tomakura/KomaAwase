<script lang="ts">
	import { courseColor, deliveryLabel, type Delivery } from '$lib/courses';
	import { wrapTitle } from '$lib/wrap-title';

	// Courses without a slot (on demand, intensive), under the grid
	let {
		courses,
		href
	}: {
		courses: {
			id: string;
			color: string;
			title: string;
			delivery: Delivery | null;
			intensiveFrom: string | null;
			intensiveTo: string | null;
		}[];
		href?: (courseId: string) => string;
	} = $props();
</script>

{#if courses.length}
	<section class="unscheduled">
		<h2>曜日・時限なし</h2>
		<div class="cards">
			{#each courses as course (course.id)}
				{@const label = deliveryLabel(course.delivery, course.intensiveFrom, course.intensiveTo)}
				<svelte:element this={href ? 'a' : 'div'} class="card" href={href?.(course.id)} style:--c={courseColor(course.color)}>
					{#key course.title}<span use:wrapTitle={course.title}>{course.title}</span>{/key}
					{#if label}<span class="delivery">{label}</span>{/if}
				</svelte:element>
			{/each}
		</div>
	</section>
{/if}

<style>
	.unscheduled {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 12px 0;
	}

	h2 {
		margin: 0;
		padding-left: 2px;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	/* The label moves under a title that needs the whole width. */
	.card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 7px 8px;
		border-radius: 8px;
		background: var(--c);
		color: var(--ink);
		font-size: 12px;
		font-weight: 700;
		text-decoration: none;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}

	.delivery {
		flex-shrink: 0;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--surface);
		font-size: 10px;
		font-weight: 400;
		white-space: nowrap;
	}
</style>
