<script lang="ts" module>
	// Stroke icons drawn on a 24px grid, in the style of the mock
	const PATHS = {
		back: 'M15 5l-7 7 7 7',
		chevron: 'M9 5l7 7-7 7',
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		close: 'M6 6l12 12M18 6L6 18',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		edit: 'M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z',
		search: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4.5 4.5',
		share: 'M12 3.5v11M8 7.5l4-4 4 4M5.5 11v7.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11',
		download: 'M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2',
		copy: 'M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9',
		external: 'M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10',
		user: 'M12 4a3.8 3.8 0 1 1 0 7.6A3.8 3.8 0 0 1 12 4zM5 20c.9-3.8 3.6-5.8 7-5.8s6.1 2 7 5.8',
		users:
			'M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M15.5 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.8c2 .7 3.4 2.4 4 5.2',
		overlap: 'M3.5 6a2.5 2.5 0 0 1 2.5-2.5h6A2.5 2.5 0 0 1 14.5 6v6a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 12zM9.5 12a2.5 2.5 0 0 1 2.5-2.5h6a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 9.5 18z',
		image: 'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5zM9 8.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM4 17l5-4.5 4 3.5 3-2.5 4 3.5',
		clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2',
		sync: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
		// A wifi signal with a slash through it
		offline: 'M2.5 9.2A15 15 0 0 1 7 6.4M21.5 9.2A15 15 0 0 0 12 5.5M5.8 12.9a10 10 0 0 1 3.4-2M18.2 12.9a10 10 0 0 0-4.8-2.6M9.2 16.6a5 5 0 0 1 5.6 0M12 20h.01M4 4l16 16',
		qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
		more: 'M5 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM12 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM19 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z',
		flag: 'M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11',
		block: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM6 6l12 12',
		trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
		badge: 'M12 3l2.4 1.8 3 .1.9 2.9 2.2 2-1 2.8.4 3-2.6 1.5-1.3 2.7-3-.4L12 21l-2.4-1.6-3 .4-1.3-2.7L2.7 15.6l.4-3-1-2.8 2.2-2 .9-2.9 3-.1zM8.5 12.2l2.3 2.3 4.7-4.8',
		history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4.5l3 1.8',
		mail: 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3.5 6.5l8.5 6.5 8.5-6.5',
		key: 'M8 9.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0zM9.3 12.7L3.5 18.5V21H6v-2h2v-2h2l1.3-1.3M14.5 8.5h.01'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 20, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
><path d={PATHS[name]} /></svg>

<style>
	.icon {
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
