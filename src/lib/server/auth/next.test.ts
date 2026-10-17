import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext', () => {
	it('keeps paths on this site', () => {
		expect(safeNext('/add/ABCDEFGHJK')).toBe('/add/ABCDEFGHJK');
		expect(safeNext('/courses/search?q=%E7%B5%B1%E8%A8%88#top')).toBe('/courses/search?q=%E7%B5%B1%E8%A8%88#top');
		expect(safeNext('/./add/ABCDEFGHJK')).toBe('/add/ABCDEFGHJK');
	});

	it('refuses other sites, however they are written', () => {
		for (const value of [
			'//evil.example',
			'/\\evil.example',
			'/\t/evil.example',
			'/\n/evil.example',
			'\t//evil.example',
			'/.//evil.example',
			'/..//evil.example',
			'/%2e//evil.example',
			'/%2E%2E//evil.example',
			'/a/..//evil.example',
			'/./\\evil.example',
			'https://evil.example/',
			'evil.example',
			'javascript:alert(1)',
			'',
			null,
			undefined
		]) {
			expect(safeNext(value)).toBeNull();
		}
	});
});
