// When the free quotas of the two AIs that read screenshots come back: both (Groq, and the
// 10,000 Neurons of Workers AI) reset at 00:00 UTC, which is 9:00 in Japan. A job put off for
// lack of quota is tried again a little after, at 10:00 Japan time, when the daily cron runs.

const DAY = 24 * 60 * 60 * 1000;
export const RETRY_AFTER_RESET = 60 * 60 * 1000;

// Every day, all users together, so the free quotas last (about 110 a day between the two)
export const TOTAL_DAILY_LIMIT = 100;

/** The most recent reset of the free quotas */
export function lastQuotaReset(now = Date.now()) {
	return new Date(Math.floor(now / DAY) * DAY);
}

/** The next time a job that could not be read is tried again: 10:00 Japan time, today if it is still ahead */
export function nextRetryTime(now = Date.now()) {
	const today = lastQuotaReset(now).getTime() + RETRY_AFTER_RESET;
	return new Date(today > now ? today : today + DAY);
}
