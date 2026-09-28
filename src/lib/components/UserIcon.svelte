<script lang="ts">
	import { iconOf, type IconSource } from '$lib/icons';

	let { user, size = 28 }: { user: IconSource; size?: number } = $props();
	const icon = $derived(iconOf(user));
</script>

<span
	class="icon"
	style:--size="{size}px"
	style:background={icon.hex}
	style:font-size="{Math.round(size * (icon.text.length > 1 ? 0.4 : 0.46))}px"
	aria-hidden="true">{icon.text}</span
>

<style>
	.icon {
		width: var(--size);
		height: var(--size);
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-radius: 50%;
		color: #fffdf8;
		font-weight: 700;
		line-height: 1;
		white-space: nowrap;
	}
</style>
