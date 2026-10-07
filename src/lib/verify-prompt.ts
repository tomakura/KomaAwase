// The screens that ask people to confirm their enrollment. Someone who never has is asked
// once; someone who has is reminded 30, 14 and 7 days before the check lapses, and once more
// after it has. What has been shown is remembered per account (users.verify_prompt_stage) as
// a number that only goes down: NEED, then the 30 / 14 / 7 day marks, then LAPSED. Verifying
// resets it.

const DAY = 24 * 60 * 60 * 1000;

export const STAGE_NEED = 99;
export const STAGE_LAPSED = 0;
const MARKS = [30, 14, 7] as const;

export type VerifyPrompt =
	// Never confirmed
	| { kind: 'need'; stage: typeof STAGE_NEED }
	// Lapses in `days` days
	| { kind: 'expiring'; stage: (typeof MARKS)[number]; days: number }
	// Lapsed, and the person has not confirmed again
	| { kind: 'lapsed'; stage: typeof STAGE_LAPSED };

/** Whole days until `expiresAt`, counting a part of a day as a day; 0 or less once it has passed */
export function daysLeft(expiresAt: number, now: number) {
	return Math.ceil((expiresAt - now) / DAY);
}

/**
 * The prompt to show now, if any. `check` is the person's check for their university (null
 * when they have none); `shown` is what has been shown so far (null = nothing).
 */
export function verifyPrompt(o: {
	supported: boolean;
	check: { expiresAt: number } | null;
	shown: number | null;
	now: number;
}): VerifyPrompt | null {
	if (!o.supported) return null;
	const days = o.check ? daysLeft(o.check.expiresAt, o.now) : null;
	if (o.check && days !== null && days > 0) {
		const stage = MARKS.find((m, i) => days <= m && (i === MARKS.length - 1 || days > MARKS[i + 1]));
		if (stage === undefined || (o.shown !== null && o.shown <= stage)) return null;
		return { kind: 'expiring', stage, days };
	}
	if (o.check) return o.shown !== null && o.shown <= STAGE_LAPSED ? null : { kind: 'lapsed', stage: STAGE_LAPSED };
	return o.shown === null ? { kind: 'need', stage: STAGE_NEED } : null;
}

/** The enrollment check screen, coming back to `from` once the link in the mail is opened */
export function verifyHref(from: URL | string) {
	const path = typeof from === 'string' ? from : from.pathname + from.search;
	return `/more/verify?from=${encodeURIComponent(path)}`;
}
