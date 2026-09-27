import { error, json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { relyingParty, saveChallenge } from '$lib/server/auth/webauthn';
import { RATE_LIMITED_MESSAGE, isRateLimited } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { locals, cookies, url, platform } = event;
	if (!platform) error(500);
	// Anyone can call this and each call stores a challenge, so cap it per IP.
	if (await isRateLimited(event, platform.env.PASSKEY_OPTIONS_LIMITER)) error(429, RATE_LIMITED_MESSAGE);

	// No allowCredentials: passkeys are discoverable, so the user picks one without typing an email.
	const options = await generateAuthenticationOptions({
		rpID: relyingParty(url).rpID,
		userVerification: 'preferred'
	});
	await saveChallenge(locals.db, cookies, options.challenge, null);
	return json(options);
};
