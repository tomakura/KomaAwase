import { describe, expect, it } from 'vitest';
import { mailtoHref } from './mail';

const SUBJECT = 'コマあわせへのお問い合わせ';

describe('mailtoHref', () => {
	it('is a link to the address, with the subject filled in', () => {
		expect(mailtoHref('taro@s.u-tokyo.ac.jp', SUBJECT)).toBe(`mailto:taro@s.u-tokyo.ac.jp?subject=${encodeURIComponent(SUBJECT)}`);
		// Read back, it is the same address
		const url = new URL(mailtoHref('taro.yamada+koma@example.ac.jp', SUBJECT));
		expect(decodeURIComponent(url.pathname)).toBe('taro.yamada+koma@example.ac.jp');
		expect(url.searchParams.get('subject')).toBe(SUBJECT);
	});

	it("can't be given cc, bcc or a body through the address", () => {
		const address = 'victim@univ.ac.jp?cc=attacker%40evil.example&bcc=b%40evil.example&body=hi#x';
		const url = new URL(mailtoHref(address, SUBJECT));
		expect([...url.searchParams.keys()]).toEqual(['subject']);
		expect(url.hash).toBe('');
		expect(decodeURIComponent(url.pathname)).toBe(address);
		// What was already encoded stays as typed, not a second @
		expect(mailtoHref('a%40b@c.jp', SUBJECT)).toMatch(/^mailto:a%2540b@c\.jp\?/);
	});
});
