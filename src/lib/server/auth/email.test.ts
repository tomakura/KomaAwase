import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

// What normalizeEmail did with a regex, which took quadratic time on long inputs
const OLD_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function oldNormalizeEmail(input: string): string | null {
	const email = input.trim().toLowerCase();
	return OLD_PATTERN.test(email) ? email : null;
}

describe('normalizeEmail', () => {
	it('trims and lowercases addresses it takes', () => {
		expect(normalizeEmail('  Taro.Yamada@Example.AC.jp \n')).toBe('taro.yamada@example.ac.jp');
		expect(normalizeEmail('a@b.c')).toBe('a@b.c');
		expect(normalizeEmail('a.@..b..')).toBe('a.@..b..');
	});

	it('refuses what is not an address', () => {
		for (const value of [
			'',
			'a',
			'@b.c',
			'a@',
			'a@b',
			'a@.b',
			'a@b.',
			'a@.',
			'a@@b.c',
			'a@b@c.d',
			'a b@c.d',
			'a@b\tc.d',
			'a@b.c\u3000d',
			'a@b\u00a0.c'
		]) {
			expect(normalizeEmail(value)).toBeNull();
		}
	});

	it('takes exactly the addresses the old regex took', () => {
		// Every string up to 7 characters long made of these
		const chars = ['a', 'B', '.', '@', ' '];
		let level = [''];
		for (let length = 1; length <= 7; length++) {
			level = level.flatMap((s) => chars.map((c) => s + c));
			for (const value of level) expect(normalizeEmail(value)).toBe(oldNormalizeEmail(value));
		}
	});

	it('answers quickly for long runs of dots', () => {
		// The old regex took about 5 seconds for each of these that it refused
		const n = 100_000;
		const started = performance.now();
		expect(normalizeEmail('a@' + '.'.repeat(n) + '@')).toBeNull();
		expect(normalizeEmail('a@' + '.'.repeat(n) + ' ')).toBe('a@' + '.'.repeat(n));
		expect(normalizeEmail('a@' + '.'.repeat(n) + ' b')).toBeNull();
		expect(normalizeEmail('a@b' + '.'.repeat(n))).toBe('a@b' + '.'.repeat(n));
		expect(performance.now() - started).toBeLessThan(1000);
	});
});
