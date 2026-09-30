import { error, json } from '@sveltejs/kit';
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { eq } from 'drizzle-orm';
import { SUSPENDED_MESSAGE } from '$lib/moderation';
import { passkeys, users } from '$lib/server/db/schema';
import { signIn } from '$lib/server/auth/session';
import { relyingParty, takeChallenge } from '$lib/server/auth/webauthn';
import type { RequestHandler } from './$types';

const FAILED = 'パスキーでログインできませんでした';

export const POST: RequestHandler = async ({ locals, cookies, url, request }) => {
	const challenge = await takeChallenge(locals.db, cookies);
	if (!challenge) error(400, 'もう一度やり直してください');

	const response = (await request.json()) as AuthenticationResponseJSON;
	const passkey = await locals.db.select().from(passkeys).where(eq(passkeys.id, response.id)).get();
	if (!passkey) error(400, FAILED);

	const { rpID, origin } = relyingParty(url);
	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: passkey.id,
				publicKey: isoBase64URL.toBuffer(passkey.publicKey),
				counter: passkey.counter,
				transports: passkey.transports ?? undefined
			}
		});
	} catch {
		error(400, FAILED);
	}
	if (!verification.verified) error(400, FAILED);

	const owner = await locals.db.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, passkey.userId)).get();
	if (owner?.suspendedAt) error(403, SUSPENDED_MESSAGE);

	await locals.db
		.update(passkeys)
		.set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
		.where(eq(passkeys.id, passkey.id));

	await signIn(locals.db, cookies, request, passkey.userId);
	return json({ ok: true });
};
