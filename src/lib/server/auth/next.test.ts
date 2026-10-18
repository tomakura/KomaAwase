import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { rememberNext, rememberReauthNext, safeNext, takeNext, takeSignInNext } from './next';

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

function jar() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	} as unknown as Cookies;
}

describe('signing in again', () => {
	it('leaves nothing for the home page to follow', () => {
		const cookies = jar();
		rememberReauthNext(cookies, '/admin');
		expect(takeNext(cookies)).toBeNull();
	});

	it('goes back to what asked, once, before any other next', () => {
		const cookies = jar();
		rememberNext(cookies, '/add/ABCDEFGHJK');
		rememberReauthNext(cookies, '/admin');
		expect(takeSignInNext(cookies)).toBe('/admin');
		expect(takeSignInNext(cookies)).toBe('/add/ABCDEFGHJK');
		expect(takeSignInNext(cookies)).toBeNull();
	});
});
