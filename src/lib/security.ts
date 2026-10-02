// What every page is sent with, kept in one place: the server adds these to its responses
// (src/hooks.server.ts), and the service worker to the page it writes itself while the
// server is slow (src/service-worker.ts), which never sees the server's headers in time.
import type { KitConfig } from '@sveltejs/kit';

type CspDirectives = NonNullable<NonNullable<KitConfig['csp']>['directives']>;

// No framing by other sites, no guessing at content types, only the origin as the referrer
// elsewhere, HTTPS from then on, and no camera, microphone or location.
export const SECURITY_HEADERS: Record<string, string> = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'strict-transport-security': 'max-age=31536000',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

// Pages load only this site's scripts, plus Turnstile on お問い合わせ. SvelteKit adds a nonce
// for its own inline script (the csp option in vite.config.ts); inline styles stay allowed
// for Svelte's transitions.
export const CSP_DIRECTIVES = {
	'default-src': ['self'],
	'script-src': ['self', 'https://challenges.cloudflare.com'],
	'style-src': ['self', 'unsafe-inline'],
	'img-src': ['self', 'data:', 'blob:'],
	'font-src': ['self'],
	'connect-src': ['self'],
	'frame-src': ['https://challenges.cloudflare.com'],
	'worker-src': ['self'],
	'manifest-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'form-action': ['self'],
	'frame-ancestors': ['none']
} satisfies CspDirectives;

const KEYWORDS = new Set(['self', 'none', 'unsafe-inline', 'unsafe-eval', 'strict-dynamic']);

/** The same policy as a header, as SvelteKit writes it, with a nonce for the inline scripts when given */
export function cspHeader(nonce?: string) {
	return Object.entries(CSP_DIRECTIVES)
		.map(([name, values]) => {
			const sources = (values as string[]).map((v) => (KEYWORDS.has(v) ? `'${v}'` : v));
			if (nonce && name === 'script-src') sources.push(`'nonce-${nonce}'`);
			return [name, ...sources].join(' ');
		})
		.join('; ');
}

/** The nonce a policy gives its inline scripts, if it has one */
export function nonceOf(csp: string | null) {
	return csp?.match(/'nonce-([A-Za-z0-9+/=_-]+)'/)?.[1] ?? null;
}
