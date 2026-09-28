import { base64url } from '../base64url';

/** Random secret for cookies and email links. Only its hash is stored. */
export function generateToken(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return base64url(new Uint8Array(digest));
}
