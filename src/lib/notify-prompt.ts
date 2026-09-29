// The screen that suggests turning notifications on: which one to show, if any. It is shown
// once on a device (or in an installed app, which keeps its own storage), and never again after
// it is closed.

/** What this device can do about notifications, as found out in the browser */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

export type PromptKind =
	// iPhone and iPad only deliver notifications to the app added to the home screen
	| 'install'
	// Nothing turned on yet
	| 'enable'
	// Turned on, but not the reminders before a class
	| 'reminder';

// Only on the tabs, so it never covers a form someone is in the middle of
export const PROMPT_ROUTES = ['/', '/overlay', '/friends', '/more'];

/**
 * `reminders` is how many times before a class were chosen, and `devices` how many of the
 * person's devices receive notifications; each is null when not known yet. Someone who has
 * notifications on elsewhere is not asked to turn them on again here.
 */
export function promptKind(o: {
	state: PushState;
	asked: boolean;
	reminders: number | null;
	devices: number | null;
}): PromptKind | null {
	if (o.asked) return null;
	if (o.state === 'install') return o.devices === 0 ? 'install' : null;
	if (o.state === 'off') return o.devices === 0 ? 'enable' : null;
	if (o.state === 'on' && o.reminders === 0) return 'reminder';
	return null;
}
