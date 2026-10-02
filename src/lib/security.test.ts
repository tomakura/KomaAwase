import { describe, expect, it } from 'vitest';
import { cspHeader, nonceOf } from './security';

describe('cspHeader', () => {
	it("is the pages' policy, with the nonce on the scripts when given", () => {
		const csp = cspHeader('abc');
		expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com 'nonce-abc'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("style-src 'self' 'unsafe-inline'");
		expect(csp).toContain('img-src');
		expect(cspHeader()).not.toContain('nonce-');
	});

	it('gives back its nonce', () => {
		expect(nonceOf(cspHeader('Ab+/9='))).toBe('Ab+/9=');
		expect(nonceOf(cspHeader())).toBeNull();
		expect(nonceOf(null)).toBeNull();
	});
});
