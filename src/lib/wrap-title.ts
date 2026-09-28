import { wrap } from './export';

// Breaks a course title into lines the way the exported image does (words kept whole where
// they fit, never ー or a small kana at the start of a line), measured against the cell.
// CSS alone breaks a word that doesn't fit anywhere, as コミュニケ|ーション. Before this runs
// (and without JavaScript) the title wraps with CSS as usual.
const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

export function wrapTitle(node: HTMLElement, parts: string[]) {
	let current = parts;
	function render() {
		const width = node.clientWidth;
		if (!canvas || !width) return;
		const style = getComputedStyle(node);
		canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		node.textContent = wrap((s) => canvas.measureText(s).width, current, width, 20).join('\n');
		node.style.whiteSpace = 'pre-line';
	}
	const resized = new ResizeObserver(render);
	resized.observe(node);
	document.fonts?.ready.then(render);
	render();
	return {
		update(next: string[]) {
			current = next;
			render();
		},
		destroy() {
			resized.disconnect();
		}
	};
}
