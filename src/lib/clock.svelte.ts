import { tokyoTime } from './time';

/**
 * Japan time that moves on every 30 seconds and when the page comes back into view.
 * Starts at the server's time so the first render matches it. Call while a component
 * is being set up.
 */
export function liveClock(serverNow: number) {
	let now = $state(serverNow);
	$effect(() => {
		const tick = () => (now = Date.now());
		tick();
		const timer = setInterval(tick, 30_000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', tick);
		};
	});
	const clock = $derived(tokyoTime(now));
	return {
		get now() {
			return now;
		},
		get clock() {
			return clock;
		}
	};
}
