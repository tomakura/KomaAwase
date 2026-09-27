import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { relyingParty, saveChallenge } from '$lib/server/auth/webauthn';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	// No allowCredentials: passkeys are discoverable, so the user picks one without typing an email.
	const options = await generateAuthenticationOptions({
		rpID: relyingParty(url).rpID,
		userVerification: 'preferred'
	});
	await saveChallenge(locals.db, cookies, options.challenge, null);
	return json(options);
};
