// Pull a sheet down to close it, as on a phone: the sheet follows the finger, and a long
// or quick enough pull closes it (the sheet slides away first); a short one springs back.
// It only starts when what's under the finger is scrolled to the top, so scrolling the
// sheet's content still works.

const CLOSE_DISTANCE = 110;
const CLOSE_SPEED = 0.6; // px per ms
// A quick flick closes only after this much, so a tiny fast twitch springs back
const FLICK_DISTANCE = 32;

// Anything between the finger and the sheet that has been scrolled down, and the page too
// when the sheet is part of it (a dialog scrolls on its own, and so does a box marked
// data-swipe-scroll around the sheet)
function scrolled(from: EventTarget | null, sheet: HTMLElement) {
	for (let el = from as HTMLElement | null; el && el !== sheet.parentElement; el = el.parentElement) {
		if (el.scrollTop > 0) return true;
	}
	// A sheet in a box of its own that scrolls (data-swipe-scroll) is judged by that box, not the page
	const box = sheet.closest<HTMLElement>('[data-swipe-scroll]');
	if (box) return box.scrollTop > 0;
	return !sheet.closest('dialog') && (document.scrollingElement?.scrollTop ?? 0) > 0;
}

export function swipeDown(sheet: HTMLElement, onclose: () => unknown) {
	let close = onclose;
	let startY = 0;
	let startAt = 0;
	let distance = 0;
	let dragging = false;
	let ignore = false;
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');

	function start(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		startY = e.touches[0].clientY;
		startAt = e.timeStamp;
		distance = 0;
		dragging = false;
		ignore = scrolled(e.target, sheet);
	}

	function move(e: TouchEvent) {
		if (ignore || e.touches.length !== 1) return;
		const d = e.touches[0].clientY - startY;
		if (!dragging) {
			// Upward, or too small to tell: leave it to scrolling
			if (d < 8) {
				if (d < -4) ignore = true;
				return;
			}
			dragging = true;
			sheet.style.transition = 'none';
		}
		e.preventDefault();
		distance = Math.max(0, d);
		sheet.style.transform = `translateY(${distance}px)`;
	}

	function end(e: TouchEvent) {
		if (!dragging) return;
		dragging = false;
		const speed = distance / Math.max(1, e.timeStamp - startAt);
		const closing = distance > CLOSE_DISTANCE || (distance > FLICK_DISTANCE && speed > CLOSE_SPEED);
		sheet.style.transition = reduced.matches ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
		if (closing) {
			sheet.style.transform = 'translateY(100%)';
			setTimeout(
				async () => {
					// After leaving the page (not before, or it would flash back), and ready for a
					// dialog that opens again. A move that fails or is called off brings it back.
					try {
						await close();
						sheet.style.transition = 'none';
					} finally {
						sheet.style.transform = '';
					}
				},
				reduced.matches ? 0 : 200
			);
		} else {
			sheet.style.transform = '';
		}
	}

	// The system took the touch away (a call, a gesture of its own): back in place, never closed
	function cancel() {
		if (!dragging) return;
		dragging = false;
		sheet.style.transition = reduced.matches ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
		sheet.style.transform = '';
	}

	sheet.addEventListener('touchstart', start, { passive: true });
	sheet.addEventListener('touchmove', move, { passive: false });
	sheet.addEventListener('touchend', end);
	sheet.addEventListener('touchcancel', cancel);
	return {
		update(next: () => unknown) {
			close = next;
		},
		destroy() {
			sheet.removeEventListener('touchstart', start);
			sheet.removeEventListener('touchmove', move);
			sheet.removeEventListener('touchend', end);
			sheet.removeEventListener('touchcancel', cancel);
		}
	};
}
