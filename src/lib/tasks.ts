// Homework (course_notes of kind 'task'): its steps, where it is handed in, and weekly copies.
import { addDays } from './time';

export type TaskStep = { text: string; done: boolean };

// The steps have no limit on screen; this only keeps a prank from swelling the data
export const STEPS_MAX = 100;
export const STEP_TEXT_MAX = 100;
export const SUBMIT_TO_MAX = 200;
// Weekly homework is made up to this many times at once
export const REPEAT_MAX = 20;

/** A link to open when the place it is handed in is an https address, with the host to show */
export function submitLink(submitTo: string | null) {
	if (!submitTo || !/^https:\/\//i.test(submitTo)) return null;
	try {
		const url = new URL(submitTo);
		return url.protocol === 'https:' ? { href: url.href, host: url.host } : null;
	} catch {
		return null;
	}
}

/** The due dates of a weekly homework: `first`, then every 7 days up to `last`, REPEAT_MAX at most */
export function weeklyDates(first: string, last: string) {
	const out: string[] = [];
	for (let d = first; d <= last && out.length < REPEAT_MAX; d = addDays(d, 7)) out.push(d);
	return out;
}

export const stepsDone = (steps: TaskStep[] | null | undefined) =>
	steps?.length ? `${steps.filter((s) => s.done).length}/${steps.length}` : null;
