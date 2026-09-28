<script lang="ts">
	import { iconOf, splitGraphemes, type IconSource } from '$lib/icons';

	// `short` keeps only the first character, for the tiny icons in the overlay.
	let { user, size = 28, short = false }: { user: IconSource; size?: number; short?: boolean } = $props();
	const icon = $derived(iconOf(user));
	const text = $derived(short ? splitGraphemes(icon.text)[0] : icon.text);
	// The photo that failed to load (not allowed, or gone): its letters show instead
	let failed = $state<string | null>(null);
</script>

{#if icon.photo && failed !== icon.photo}
	<img
		class="icon"
		style:--size="{size}px"
		style:background={icon.hex}
		src={icon.photo}
		alt=""
		width={size}
		height={size}
		loading="lazy"
		decoding="async"
		onerror={() => (failed = icon.photo)}
	/>
{:else}
	<span
		class="icon"
		style:--size="{size}px"
		style:background={icon.hex}
		style:font-size="{Math.round(size * (splitGraphemes(text).length > 1 ? 0.4 : 0.5))}px"
		aria-hidden="true">{text}</span
	>
{/if}

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

	img.icon {
		object-fit: cover;
	}
</style>
