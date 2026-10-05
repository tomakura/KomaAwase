import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBackupZip, openBackup } from './backup';

afterEach(() => vi.unstubAllGlobals());

describe('the backup ZIP', () => {
	it('holds data.json with each file at its path, and opens again', async () => {
		const data = {
			app: 'コマあわせ',
			format: 1,
			timetables: [{ year: 2026, courses: [{ title: '線形/代数', files: [{ name: 'a.pdf', mime: 'application/pdf', size: 3, url: '/courses/c1/files/f1' }] }] }]
		};
		vi.stubGlobal('fetch', async (url: string) =>
			url === '/more/data' ? new Response(JSON.stringify(data)) : new Response(new Uint8Array([1, 2, 3]))
		);
		const zip = await makeBackupZip();
		const opened = await openBackup(new File([zip], 'b.zip'));
		const json = JSON.parse(opened!.json);
		const file = json.timetables[0].courses[0].files[0];
		expect(file.url).toBeUndefined();
		expect(file.path).toBe('files/2026/1-線形_代数/1-a.pdf');
		expect([...opened!.files.get(file.path)!]).toEqual([1, 2, 3]);
	});

	it('opens a JSON file as it is', async () => {
		expect((await openBackup(new File(['{"a":1}'], 'b.json')))?.json).toBe('{"a":1}');
	});
});
