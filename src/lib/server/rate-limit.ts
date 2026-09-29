import type { RequestEvent } from '@sveltejs/kit';

export const RATE_LIMITED_MESSAGE = 'しばらく待ってからもう一度やり直してください';

/** True when the caller's IP is over the limiter's budget. */
export async function isRateLimited(event: RequestEvent, limiter: RateLimit): Promise<boolean> {
	const { success } = await limiter.limit({ key: event.getClientAddress() });
	return !success;
}
