// Signatures for requests to the rental server (relay/send.php, relay/files.php)
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
	return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
