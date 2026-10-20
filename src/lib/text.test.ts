import { describe, expect, it } from 'vitest';
import { ONLINE_ROOM, cleanRoom } from './text';

describe('cleanRoom', () => {
	it('splits rooms by a slash with spaces', () => {
		expect(cleanRoom('E15／E16')).toBe('E15 / E16');
	});

	it('writes an online class as オンライン', () => {
		for (const typed of ['遠隔', 'Zoom', 'ZOOM', 'ｚｏｏｍ', 'リモート', 'オンライン授業', 'Google Meet', ' online ']) {
			expect(cleanRoom(typed)).toBe(ONLINE_ROOM);
		}
	});

	it('leaves a room that only mentions it', () => {
		expect(cleanRoom('E15 / Zoom')).toBe('E15 / Zoom');
	});
});
