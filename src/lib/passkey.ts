import {
	browserSupportsWebAuthnAutofill,
	startAuthentication,
	startRegistration,
	WebAuthnAbortService,
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

/**
 * Null when the person cancelled (or, when signing in, the device has no passkey for this
 * site, which browsers report the same way); else the message to show.
 */
function toMessage(e: unknown): string | null {
	if (e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED') return null;
	if (e instanceof WebAuthnError && e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'この端末のパスキーは、すでに存在します。';
	if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return null;
	return e instanceof Error ? e.message : 'うまくいきませんでした';
}

/**
 * Signs in with a passkey. With `autofill`, it waits for one picked from the email field's
 * suggestions (the field has autocomplete="username webauthn"), until another sign-in starts.
 */
export async function loginWithPasskey(autofill = false): Promise<{ ok: boolean; message: string | null }> {
	try {
		const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>('/api/passkey/login/options');
		const response = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
		await post('/api/passkey/login/verify', response);
		return { ok: true, message: null };
	} catch (e) {
		return { ok: false, message: toMessage(e) };
	}
}

/** Whether this browser offers passkeys among the email field's suggestions */
export const canAutofillPasskey = () => browserSupportsWebAuthnAutofill().catch(() => false);

/** Stops a sign-in waiting on the email field, when leaving the page */
export const stopPasskeyAutofill = () => WebAuthnAbortService.cancelCeremony();

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
