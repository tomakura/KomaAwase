import { describe, expect, it } from 'vitest';
import { isQuiet, wants } from './notify';

describe('wants', () => {
	it('keeps the old kinds on and the homework ones off until chosen', () => {
		expect(wants(null, 'friendRequest')).toBe(true);
		expect(wants({ friendRequest: false }, 'friendRequest')).toBe(false);
		expect(wants({}, 'taskBefore1h')).toBe(false);
		expect(wants({ taskBefore1h: true }, 'taskBefore1h')).toBe(true);
	});
});

describe('isQuiet', () => {
	it('covers hours over midnight and within a day', () => {
		const night = { from: '23:00', to: '07:00' };
		expect(isQuiet(night, 23 * 60)).toBe(true);
		expect(isQuiet(night, 3 * 60)).toBe(true);
		expect(isQuiet(night, 7 * 60)).toBe(false);
		expect(isQuiet({ from: '12:00', to: '13:00' }, 12 * 60 + 30)).toBe(true);
		expect(isQuiet(undefined, 0)).toBe(false);
	});
});
