// Cloudflare Turnstile, the check against automated sending on the contact form. Without the
// keys (set with `wrangler secret put`), the form works without it: the other limits stay.

export const turnstileSiteKey = (env: Env | undefined) => (env?.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY : null);

/** Whether the token the widget put in the form is good; true when Turnstile isn't set up */
export async function passesTurnstile(env: Env | undefined, token: FormDataEntryValue | null, ip: string) {
	if (!turnstileSiteKey(env)) return true;
	if (typeof token !== 'string' || !token) return false;
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body: new URLSearchParams({ secret: env!.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip }),
			signal: AbortSignal.timeout(10_000)
		});
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch (e) {
		console.error('turnstile check failed', e);
		return false;
	}
}
