import { describe, expect, it } from 'vitest';
import { imagesOf, SHEETS_MAX } from './images';
import { joinSheets, readSheets } from './providers';

const url = (n: number) => `data:image/jpeg;base64,${'A'.repeat(n + 3)}`;

describe('imagesOf', () => {
	it('takes one data URL, or a JSON list of them', () => {
		expect(imagesOf(url(1))).toEqual([url(1)]);
		expect(imagesOf(JSON.stringify([url(1), url(2)]))).toEqual([url(1), url(2)]);
	});

	it('refuses anything else', () => {
		expect(imagesOf('http://example.com/a.jpg')).toBeNull();
		expect(imagesOf('data:text/html;base64,AAAA')).toBeNull();
		expect(imagesOf('[')).toBeNull();
		expect(imagesOf('[]')).toBeNull();
		expect(imagesOf(JSON.stringify([url(1), 'https://example.com']))).toBeNull();
		expect(imagesOf(JSON.stringify([url(1), 3]))).toBeNull();
		expect(imagesOf(JSON.stringify(Array.from({ length: SHEETS_MAX + 1 }, () => url(1))))).toBeNull();
	});
});

describe('joinSheets', () => {
	it('joins the cells each sheet answered with', () => {
		const cell = (tag: string) => ({ cell: tag, title: '', teacher: '', room: '', code: '' });
		expect(joinSheets([{ courses: [cell('A0')] }, JSON.stringify({ courses: [cell('B1'), cell('C2')] })])).toEqual({
			courses: [cell('A0'), cell('B1'), cell('C2')]
		});
	});

	it('fails when a sheet has no list, so the other AI reads them all again', () => {
		expect(() => joinSheets([{ courses: [] }, { lessons: [] }])).toThrow('unexpected answer');
		expect(() => joinSheets([{ courses: [] }, 'not json'])).toThrow('unexpected answer');
		expect(() => joinSheets([{ courses: [] }, null])).toThrow('unexpected answer');
	});
});

describe('readSheets', () => {
	it('reads one picture as it is, and several one after another', async () => {
		const seen: string[] = [];
		const read = async (image: string) => {
			seen.push(image);
			return { courses: [{ cell: image }] };
		};
		expect(await readSheets(read, ['a'])).toEqual({ courses: [{ cell: 'a' }] });
		seen.length = 0;
		expect(await readSheets(read, ['a', 'b', 'c'])).toEqual({ courses: [{ cell: 'a' }, { cell: 'b' }, { cell: 'c' }] });
		expect(seen).toEqual(['a', 'b', 'c']);
	});

	it('lets what stops a sheet (busy, out of quota) stop the whole read', async () => {
		await expect(
			readSheets(async (image) => {
				if (image === 'b') throw new Error('busy');
				return { courses: [] };
			}, ['a', 'b'])
		).rejects.toThrow('busy');
	});
});
