// Web Push with WebCrypto only: messages are encrypted for the browser (RFC 8291,
// aes128gcm) and the request is signed with the app's VAPID key (RFC 8292), so the push
// service (Apple, Google, Mozilla, Microsoft) can't read them.

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string) {
	const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
	const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };

/** The encrypted body for one browser: salt, record size, the one-time public key, then the ciphertext. */
export async function encryptPayload(subscription: Subscription, payload: Uint8Array) {
	const uaPublic = fromBase64url(subscription.p256dh);
	const authSecret = fromBase64url(subscription.auth);
	const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
	const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

	// HKDF, one block each: the input keying material, then the content key and nonce
	const prkKey = await hmac(authSecret, shared);
	const ikm = await hmac(prkKey, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const prk = await hmac(salt, ikm);
	const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
	const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

	// One record: the message, then the delimiter 0x02 that marks the last record
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2])))
	);
	const header = new Uint8Array(21);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublic.length;
	return concat(header, asPublic, ciphertext);
}

/** The Authorization header: a short-lived JWT for the push service's origin, signed with the VAPID key. */
export async function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string }, subject: string) {
	const pub = fromBase64url(keys.publicKey);
	const jwk = {
		kty: 'EC',
		crv: 'P-256',
		d: keys.privateKey,
		x: base64url(pub.slice(1, 33)),
		y: base64url(pub.slice(33, 65))
	};
	const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	const part = (o: object) => base64url(encoder.encode(JSON.stringify(o)));
	const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
		sub: subject
	})}`;
	const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)));
	return `vapid t=${unsigned}.${base64url(signature)}, k=${keys.publicKey}`;
}

// Only the browsers' push services, so a subscription can't point the Worker anywhere else
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string) {
	try {
		const url = new URL(endpoint);
		return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname));
	} catch {
		return false;
	}
}

/** Sends one message. 'gone' when the browser has dropped the subscription (404/410). */
export async function sendPush(
	subscription: Subscription,
	message: object,
	keys: { publicKey: string; privateKey: string },
	subject: string
): Promise<'sent' | 'gone' | 'failed'> {
	const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(message)));
	const res = await fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
			'content-encoding': 'aes128gcm',
			'content-type': 'application/octet-stream',
			ttl: String(24 * 60 * 60),
			urgency: 'normal'
		},
		body,
		signal: AbortSignal.timeout(10_000)
	});
	if (res.status === 404 || res.status === 410) return 'gone';
	return res.ok ? 'sent' : 'failed';
}
