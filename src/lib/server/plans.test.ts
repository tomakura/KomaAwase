import { describe, expect, it } from 'vitest';
import { parseEvent } from './plans';

const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('parseEvent', () => {
	it('keeps the times of an event that has them', () => {
		expect(parseEvent(form({ title: 'あ', date: '2026-10-02', start: '14:00', end: '15:00' }))).toMatchObject({
			event: { startTime: '14:00', endTime: '15:00' }
		});
	});

	it('drops the times of an all-day event', () => {
		expect(parseEvent(form({ title: 'あ', date: '2026-10-02', allDay: 'on', start: '14:00', end: '15:00' }))).toMatchObject({
			event: { startTime: null, endTime: null }
		});
	});

	it('refuses an end without a start, or before it', () => {
		expect(parseEvent(form({ title: 'あ', date: '2026-10-02', end: '15:00' }))).toHaveProperty('message');
		expect(parseEvent(form({ title: 'あ', date: '2026-10-02', start: '16:00', end: '15:00' }))).toHaveProperty('message');
	});
});
