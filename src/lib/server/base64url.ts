// base64url without padding, as tokens, VAPID keys and push payloads use it. Kept here rather
// than taken from @simplewebauthn/server/helpers, which brings its certificate libraries
// (about 600KB) into every request that touches a session.
export function base64url(bytes: Uint8Array) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string) {
	const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
