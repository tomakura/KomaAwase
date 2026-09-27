import { error, json } from '@sveltejs/kit';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { passkeys } from '$lib/server/db/schema';
import { relyingParty, takeChallenge } from '$lib/server/auth/webauthn';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies, url, request }) => {
	const user = locals.user;
	if (!user) error(401);

	const challenge = await takeChallenge(locals.db, cookies);
	if (!challenge || challenge.userId !== user.id) error(400, 'もう一度やり直してください');

	const { rpID, origin } = relyingParty(url);
	const response = (await request.json()) as RegistrationResponseJSON;
	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID
		});
	} catch {
		error(400, 'パスキーを確認できませんでした');
	}
	if (!verification.verified) error(400, 'パスキーを確認できませんでした');

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
	await locals.db.insert(passkeys).values({
		id: credential.id,
		userId: user.id,
		publicKey: isoBase64URL.fromBuffer(credential.publicKey),
		counter: credential.counter,
		transports: credential.transports ?? null,
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp
	});

	return json({ ok: true });
};
