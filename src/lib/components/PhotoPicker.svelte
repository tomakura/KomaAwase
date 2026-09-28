<script lang="ts">
	// Frames a photo for the round icon: drag to move it, the slider to zoom. The picture
	// always fills the circle. render() gives the framed square as a small JPEG.
	import { PHOTO_MAX_BYTES, PHOTO_SIZE } from '$lib/icons';

	let { src }: { src: string } = $props();

	const VIEW = 240;
	let image = $state<HTMLImageElement>();
	let natural = $state({ w: 0, h: 0 });
	let zoom = $state(1);
	let offset = $state({ x: 0, y: 0 });

	// Scale at zoom 1: the short side fills the frame
	const base = $derived(natural.w ? VIEW / Math.min(natural.w, natural.h) : 1);
	const scale = $derived(base * zoom);

	function clamp(o: { x: number; y: number }, s = scale) {
		return {
			x: Math.min(0, Math.max(VIEW - natural.w * s, o.x)),
			y: Math.min(0, Math.max(VIEW - natural.h * s, o.y))
		};
	}

	function loaded() {
		if (!image) return;
		natural = { w: image.naturalWidth, h: image.naturalHeight };
		zoom = 1;
		const s = VIEW / Math.min(natural.w, natural.h);
		offset = { x: (VIEW - natural.w * s) / 2, y: (VIEW - natural.h * s) / 2 };
	}

	// Zooms about the middle of the frame
	function setZoom(next: number) {
		const before = scale;
		const after = base * next;
		const cx = (VIEW / 2 - offset.x) / before;
		const cy = (VIEW / 2 - offset.y) / before;
		zoom = next;
		offset = clamp({ x: VIEW / 2 - cx * after, y: VIEW / 2 - cy * after }, after);
	}

	let drag: { x: number; y: number; start: { x: number; y: number } } | null = null;
	function down(e: PointerEvent) {
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = { x: e.clientX, y: e.clientY, start: { ...offset } };
	}
	function move(e: PointerEvent) {
		if (!drag) return;
		offset = clamp({ x: drag.start.x + e.clientX - drag.x, y: drag.start.y + e.clientY - drag.y });
	}
	const up = () => (drag = null);

	/** The framed square as a JPEG data URL, small enough to store */
	export function render(): string | null {
		if (!image || !natural.w) return null;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = PHOTO_SIZE;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const k = PHOTO_SIZE / VIEW;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(image, offset.x * k, offset.y * k, natural.w * scale * k, natural.h * scale * k);
		for (const quality of [0.86, 0.75, 0.6, 0.45]) {
			const url = canvas.toDataURL('image/jpeg', quality);
			// base64 is 4 characters for every 3 bytes
			if (((url.length - 23) * 3) / 4 <= PHOTO_MAX_BYTES) return url;
		}
		return null;
	}
</script>

<div class="picker">
	<div
		class="frame"
		style:--view="{VIEW}px"
		role="img"
		aria-label="写真の見える範囲。ドラッグで動かせます"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		<img
			bind:this={image}
			{src}
			alt=""
			onload={loaded}
			draggable="false"
			style:width="{natural.w * scale}px"
			style:height="{natural.h * scale}px"
			style:transform="translate({offset.x}px, {offset.y}px)"
		/>
	</div>
	<label class="zoom">
		<span>小さく</span>
		<input
			type="range"
			min="1"
			max="4"
			step="0.01"
			value={zoom}
			oninput={(e) => setZoom(Number(e.currentTarget.value))}
			aria-label="写真の大きさ"
		/>
		<span>大きく</span>
	</label>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	.frame {
		position: relative;
		width: var(--view);
		height: var(--view);
		overflow: hidden;
		border-radius: 50%;
		background: var(--slot);
		touch-action: none;
		cursor: grab;
	}

	.frame:active {
		cursor: grabbing;
	}

	img {
		position: absolute;
		top: 0;
		left: 0;
		max-width: none;
		transform-origin: 0 0;
		user-select: none;
		pointer-events: none;
	}

	.zoom {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 240px;
		max-width: 100%;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.zoom input {
		flex: 1;
		accent-color: var(--ink);
	}
</style>
