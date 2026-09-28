<script lang="ts">
	// Picks the part of a screenshot to send: drag the corners, or the frame itself.
	// The frame is kept as fractions of the image, so it survives the page resizing.
	let { src }: { src: string } = $props();

	let rect = $state({ x: 0, y: 0, w: 1, h: 1 });
	let box = $state<HTMLDivElement>();
	let image = $state<HTMLImageElement>();
	const MIN = 0.1;

	type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';
	let drag: { handle: Handle; x: number; y: number; start: typeof rect } | null = null;

	function down(handle: Handle, e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = { handle, x: e.clientX, y: e.clientY, start: { ...rect } };
	}

	function move(e: PointerEvent) {
		if (!drag || !box) return;
		const size = box.getBoundingClientRect();
		const dx = (e.clientX - drag.x) / size.width;
		const dy = (e.clientY - drag.y) / size.height;
		const s = drag.start;
		const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
		if (drag.handle === 'move') {
			rect = { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
			return;
		}
		let { x, y, w, h } = s;
		if (drag.handle.includes('w')) {
			const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
			w = s.w + (s.x - nx);
			x = nx;
		} else {
			w = clamp(s.w + dx, MIN, 1 - s.x);
		}
		if (drag.handle.includes('n')) {
			const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
			h = s.h + (s.y - ny);
			y = ny;
		} else {
			h = clamp(s.h + dy, MIN, 1 - s.y);
		}
		rect = { x, y, w, h };
	}

	const up = () => (drag = null);

	export function reset() {
		rect = { x: 0, y: 0, w: 1, h: 1 };
	}

	/** The chosen part as a JPEG data URL, at most `longest` pixels on its long side. */
	export async function crop(longest = 1600): Promise<string | null> {
		if (!image?.naturalWidth) return null;
		const sx = rect.x * image.naturalWidth;
		const sy = rect.y * image.naturalHeight;
		const sw = rect.w * image.naturalWidth;
		const sh = rect.h * image.naturalHeight;
		const scale = Math.min(1, longest / Math.max(sw, sh));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(sw * scale);
		canvas.height = Math.round(sh * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
		// Smaller until it fits comfortably in a database row
		for (const quality of [0.85, 0.75, 0.6, 0.45]) {
			const url = canvas.toDataURL('image/jpeg', quality);
			if (url.length < 1_400_000) return url;
		}
		return null;
	}
</script>

<div class="cropper" role="group" aria-label="送る範囲" bind:this={box} onpointermove={move} onpointerup={up} onpointercancel={up}>
	<img bind:this={image} {src} alt="選んだスクリーンショット" draggable="false" />
	<div
		class="frame"
		role="presentation"
		style:left="{rect.x * 100}%"
		style:top="{rect.y * 100}%"
		style:width="{rect.w * 100}%"
		style:height="{rect.h * 100}%"
		onpointerdown={(e) => down('move', e)}
	>
		{#each ['nw', 'ne', 'sw', 'se'] as const as corner (corner)}
			<span class="handle {corner}" role="presentation" onpointerdown={(e) => down(corner, e)}></span>
		{/each}
	</div>
</div>

<style>
	/* As big as the image, so the frame's fractions are fractions of the picture itself */
	.cropper {
		position: relative;
		width: fit-content;
		max-width: 100%;
		margin: 0 auto;
		overflow: hidden;
		border-radius: 12px;
		touch-action: none;
		user-select: none;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 70svh;
		pointer-events: none;
	}

	/* The dark outside is the frame's own shadow. */
	.frame {
		position: absolute;
		box-sizing: border-box;
		border: 2px solid #fffdf8;
		box-shadow: 0 0 0 9999px rgb(28 26 24 / 0.55);
		cursor: move;
	}

	/* Inside the frame's corners, so none is cut off at the image's edge */
	.handle {
		position: absolute;
		width: 32px;
		height: 32px;
		margin: -4px;
	}

	.handle::after {
		content: '';
		position: absolute;
		inset: 8px;
		border-radius: 50%;
		background: #fffdf8;
		box-shadow: 0 0 0 2px var(--shu);
	}

	.nw {
		left: 0;
		top: 0;
		cursor: nwse-resize;
	}

	.ne {
		right: 0;
		top: 0;
		cursor: nesw-resize;
	}

	.sw {
		left: 0;
		bottom: 0;
		cursor: nesw-resize;
	}

	.se {
		right: 0;
		bottom: 0;
		cursor: nwse-resize;
	}
</style>
