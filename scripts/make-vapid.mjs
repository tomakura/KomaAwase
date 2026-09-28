// Makes the key pair for notifications (VAPID) and stores it as the Worker's secrets,
// without printing the private key: node scripts/make-vapid.mjs
// Run it once; a new pair makes every browser subscribe again.
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
const privateKey = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d;

for (const [name, value] of [
	['VAPID_PUBLIC_KEY', publicKey],
	['VAPID_PRIVATE_KEY', privateKey]
]) {
	const put = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'], shell: true });
	if (put.status !== 0) process.exit(put.status ?? 1);
}
console.log('Stored VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
