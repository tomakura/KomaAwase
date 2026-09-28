import { describe, expect, it } from 'vitest';
import { base64url, encryptPayload, fromBase64url, isPushEndpoint, vapidAuthorization } from './push';

const encoder = new TextEncoder();

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
	const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// What the browser does on its side (RFC 8291), written apart from the code under test
async function decrypt(body: Uint8Array<ArrayBuffer>, ua: CryptoKeyPair, uaPublic: Uint8Array<ArrayBuffer>, auth: Uint8Array<ArrayBuffer>) {
	const salt = body.slice(0, 16);
	const idlen = body[20];
	const asPublic = body.slice(21, 21 + idlen);
	const ciphertext = body.slice(21 + idlen);
	const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
	const ikm = await hmac(await hmac(auth, shared), new Uint8Array([...encoder.encode('WebPush: info\0'), ...uaPublic, ...asPublic, 1]));
	const prk = await hmac(salt, ikm);
	const cek = (await hmac(prk, new Uint8Array([...encoder.encode('Content-Encoding: aes128gcm\0'), 1]))).slice(0, 16);
	const nonce = (await hmac(prk, new Uint8Array([...encoder.encode('Content-Encoding: nonce\0'), 1]))).slice(0, 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
	expect(plain.at(-1)).toBe(2);
	return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push', () => {
	it('encrypts a message only the subscribed browser can read', async () => {
		const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
		const uaPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer);
		const auth = crypto.getRandomValues(new Uint8Array(16));
		const message = JSON.stringify({ title: 'ゆうとさんから友だち申請が届きました', url: '/friends' });
		const body = await encryptPayload({ endpoint: 'https://fcm.googleapis.com/x', p256dh: base64url(uaPublic), auth: base64url(auth) }, encoder.encode(message));
		expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
		expect(await decrypt(body, ua, uaPublic, auth)).toBe(message);
	});

	it('signs the VAPID token so it checks out with the public key', async () => {
		const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
		const publicKey = base64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer));
		const privateKey = ((await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey).d!;
		const header = await vapidAuthorization('https://web.push.apple.com/abc', { publicKey, privateKey }, 'https://koma.tomakura.com');
		const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
		expect(k).toBe(publicKey);
		const [h, c, s] = token.split('.');
		const claims = JSON.parse(new TextDecoder().decode(fromBase64url(c)));
		expect(claims.aud).toBe('https://web.push.apple.com');
		expect(claims.sub).toBe('https://koma.tomakura.com');
		const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromBase64url(s), encoder.encode(`${h}.${c}`));
		expect(ok).toBe(true);
	});

	it('only accepts the browsers push services', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isPushEndpoint('https://web.push.apple.com/QK...')).toBe(true);
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
		expect(isPushEndpoint('https://evil.example/googleapis.com')).toBe(false);
		expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
		expect(isPushEndpoint('not a url')).toBe(false);
	});
});
