// The words and numbers the admin's tools (src/lib/server/moderation.ts) share with the screens.
export const SUSPENDED_MESSAGE = 'このアカウントは、利用が制限されています。';
export const WARNING_MAX = 500;
// The 「理解しました」 button can't be pressed for this long once a warning is shown
export const WARNING_WAIT_SECONDS = 10;

const length = (s: string) => [...s].length;

/** The text of a warning, or the message to show */
export function readWarning(input: unknown): { body: string } | { message: string } {
	const body = String(input ?? '').trim();
	if (!body || length(body) > WARNING_MAX) return { message: `警告の文は1〜${WARNING_MAX}文字で入れてください` };
	return { body };
}

