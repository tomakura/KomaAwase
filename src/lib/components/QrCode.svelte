<script lang="ts">
	import { encode } from 'uqr';

	// Dark modules on a light square in both themes, so any camera reads it.
	let { text, size = 200, label }: { text: string; size?: number; label: string } = $props();

	const qr = $derived(encode(text, { ecc: 'M', border: 2 }));
	const path = $derived(
		qr.data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
	);
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={label} shape-rendering="crispEdges">
	<rect width={qr.size} height={qr.size} fill="#fffdf8" />
	<path d={path} fill="#2b2824" />
</svg>

<style>
	.qr {
		display: block;
		border-radius: 12px;
	}
</style>
