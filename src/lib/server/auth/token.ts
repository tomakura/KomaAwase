import { isoBase64URL } from '@simplewebauthn/server/helpers';

/** Random secret for cookies and email links. Only its hash is stored. */
export function generateToken(): string {
	return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return isoBase64URL.fromBuffer(new Uint8Array(digest));
}
