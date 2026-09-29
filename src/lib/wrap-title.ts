import { wrap } from './export';
import { titleParts } from './title';

// Breaks a course title into lines the way the exported image does (words kept whole where
// they fit, never ー or a small kana at the start of a line), measured against the cell.
// CSS alone breaks a word that doesn't fit anywhere, as コミュニケ|ーション. The server sends
// the plain title, which wraps with CSS until this runs (and without JavaScript).
const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

export function wrapTitle(node: HTMLElement, title: string) {
	let current = titleParts(title);
	function render() {
		// Not clientWidth, which rounds down: a box that takes its width from its longest line would
		// then break that line, and get narrower again on every pass. The extra half pixel is for
		// the canvas and the page measuring the same text a hair apart.
		const width = node.getBoundingClientRect().width + 0.5;
		if (!canvas || width < 1) return;
		const style = getComputedStyle(node);
		canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		node.textContent = wrap((s) => canvas.measureText(s).width, current, width, 20).join('\n');
		node.style.whiteSpace = 'pre-line';
	}
	const resized = new ResizeObserver(render);
	resized.observe(node);
	// Again once the web fonts arrive, since they measure differently from the fallback
	document.fonts?.addEventListener('loadingdone', render);
	document.fonts?.ready.then(render);
	render();
	return {
		update(next: string) {
			current = titleParts(next);
			render();
		},
		destroy() {
			resized.disconnect();
			document.fonts?.removeEventListener('loadingdone', render);
		}
	};
}
