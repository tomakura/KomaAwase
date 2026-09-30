import { describe, expect, it } from 'vitest';
import { WARNING_MAX, readWarning } from './moderation';

describe('readWarning', () => {
	it('trims the text', () => {
		expect(readWarning('  ルールを守ってください  ')).toEqual({ body: 'ルールを守ってください' });
	});

	it('refuses an empty text and one that is too long', () => {
		expect(readWarning('   ')).toHaveProperty('message');
		expect(readWarning(null)).toHaveProperty('message');
		expect(readWarning('あ'.repeat(WARNING_MAX))).toHaveProperty('body');
		expect(readWarning('あ'.repeat(WARNING_MAX + 1))).toHaveProperty('message');
	});
});
