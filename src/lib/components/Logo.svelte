<script lang="ts">
	// The mark, drawn with the theme's colors: where the two squares overlap it is dark in the
	// light theme and light in the dark one (the same as the header of the timetable).
	let { size = 88 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
	<rect x="4" y="8" width="26" height="26" rx="7" fill="var(--shu)" />
	<rect x="18" y="14" width="26" height="26" rx="7" fill="var(--ai)" style="mix-blend-mode: var(--logo-blend)" />
</svg>
