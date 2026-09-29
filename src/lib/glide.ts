import { still } from './motion';

// Makes a grid grow and shrink smoothly when what is in it changes, instead of jumping: taller
// rows for more classes in a slot, a column for a day that wasn't there. Rows are 1fr of the
// grid's height, so animating the height moves them all; columns are animated as pixel lists,
// with the shorter list padded with empty tracks (a new column starts at 0 wide).
//
// It compares with the sizes it saw last: the height whenever the page laid out again, and the
// columns when the number of them, which the action is given, changes.
const DURATION = 320;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Below this a change is a rounding difference or a font arriving, not a change to show
const THRESHOLD = 4;

const tracks = (node: HTMLElement) =>
	getComputedStyle(node)
		.gridTemplateColumns.split(' ')
		.map((t) => parseFloat(t));

const template = (list: number[], length: number) => Array.from({ length }, (_, i) => `${list[i] ?? 0}px`).join(' ');

export function glide(node: HTMLElement, _columns?: number) {
	let running: Animation[] = [];
	let height = node.offsetHeight;
	let width = node.offsetWidth;
	let columns = tracks(node);

	const settle = () => {
		running = [];
		height = node.offsetHeight;
		width = node.offsetWidth;
		columns = tracks(node);
	};

	function check() {
		// Where it was: the sizes seen last, or how far the last change had got
		const from = running.length ? { height: node.offsetHeight, columns: tracks(node) } : { height, columns };
		running.forEach((a) => a.cancel());
		running = [];
		const to = { height: node.offsetHeight, width: node.offsetWidth, columns: tracks(node) };
		if (to.width === width && !still() && from.height > 0) {
			const options = { duration: DURATION, easing: EASING };
			if (Math.abs(to.height - from.height) >= THRESHOLD) {
				running.push(node.animate({ height: [`${from.height}px`, `${to.height}px`] }, options));
			}
			const n = Math.max(from.columns.length, to.columns.length);
			if (from.columns.length !== to.columns.length && [...from.columns, ...to.columns].every(Number.isFinite)) {
				running.push(node.animate({ gridTemplateColumns: [template(from.columns, n), template(to.columns, n)] }, options));
			}
		}
		if (!running.length) return settle();
		Promise.allSettled(running.map((a) => a.finished)).then(() => {
			// A change that came in the meantime has its own animations
			if (running.every((a) => a.playState !== 'running')) settle();
		});
	}

	// The height changes when the classes in it do, with no change to the number of columns
	const watch = new ResizeObserver(() => {
		if (!running.length) check();
	});
	watch.observe(node);

	return {
		update: check,
		destroy() {
			watch.disconnect();
			running.forEach((a) => a.cancel());
		}
	};
}
