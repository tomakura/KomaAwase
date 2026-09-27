import { error, json } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { passkeys } from '$lib/server/db/schema';
import { RP_NAME, relyingParty, saveChallenge } from '$lib/server/auth/webauthn';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	const user = locals.user;
	if (!user) error(401);

	const existing = await locals.db
		.select({ id: passkeys.id, transports: passkeys.transports })
		.from(passkeys)
		.where(eq(passkeys.userId, user.id));

	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: relyingParty(url).rpID,
		userName: user.email,
		userDisplayName: user.nickname ?? user.email,
		userID: new TextEncoder().encode(user.id),
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
	});

	await saveChallenge(locals.db, cookies, options.challenge, user.id);
	return json(options);
};
