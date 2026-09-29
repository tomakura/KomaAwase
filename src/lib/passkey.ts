import {
	startAuthentication,
	startRegistration,
	WebAuthnError,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';

async function post<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: 'POST',
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const data = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(data?.message ?? 'うまくいきませんでした。もう一度やり直してください');
	}
	return (await res.json()) as T;
}

/** Returns an error message to show, or null on success / when the user cancelled. */
function toMessage(e: unknown): string | null {
	if (e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED') return null;
	if (e instanceof Error && e.name === 'NotAllowedError') return null;
	return e instanceof Error ? e.message : 'うまくいきませんでした';
}

export async function loginWithPasskey(): Promise<{ ok: boolean; message: string | null }> {
	try {
		const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>('/api/passkey/login/options');
		const response = await startAuthentication({ optionsJSON });
		await post('/api/passkey/login/verify', response);
		return { ok: true, message: null };
	} catch (e) {
		return { ok: false, message: toMessage(e) };
	}
}

export async function registerPasskey(): Promise<{ ok: boolean; message: string | null }> {
	try {
		const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>('/api/passkey/register/options');
		const response = await startRegistration({ optionsJSON });
		await post('/api/passkey/register/verify', response);
		return { ok: true, message: null };
	} catch (e) {
		return { ok: false, message: toMessage(e) };
	}
}
