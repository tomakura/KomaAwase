import { describe, expect, it } from 'vitest';
import { compareCourse, titleDoubt, type Existing } from './import-review';

describe('titleDoubt', () => {
	it('marks unread letters and one-letter names', () => {
		expect(titleDoubt('線形代?')).toBe(true);
		expect(titleDoubt('英□')).toBe(true);
		expect(titleDoubt('英')).toBe(true);
		expect(titleDoubt('体育')).toBe(false);
		expect(titleDoubt('線形代数学')).toBe(false);
	});
});

const course = (over: Partial<Existing>): Existing => ({
	id: 'c1',
	title: '線形代数',
	synced: false,
	sharedCourseId: null,
	slots: [{ weekday: 1, period: 2, span: 1, room: 'A101' }],
	teachers: ['山田'],
	termIds: ['q1'],
	...over
});
const read = (over: Partial<{ title: string; slots: { weekday: number; period: number; span: number; room: string }[]; teachers: string[] }> = {}) => ({
	title: '線形代数',
	slots: [{ weekday: 1, period: 2, span: 1, room: 'A101' }],
	teachers: ['山田'],
	...over
});

describe('compareCourse', () => {
	it('finds a course already there as it is, blanks not counting', () => {
		expect(compareCourse(read(), ['q1'], [course({})]).kind).toBe('same');
		expect(compareCourse(read({ teachers: [], slots: [{ weekday: 1, period: 2, span: 1, room: '' }] }), ['q1'], [course({})]).kind).toBe('same');
	});

	it('lists what differs for the same name', () => {
		const r = compareCourse(read({ slots: [{ weekday: 2, period: 2, span: 1, room: 'B202' }], teachers: ['佐藤'] }), ['q1'], [course({})]);
		expect(r).toMatchObject({ kind: 'changed', diffs: ['曜日・時限', '先生'] });
		expect(compareCourse(read({ slots: [{ weekday: 1, period: 2, span: 1, room: 'B202' }] }), ['q1'], [course({})])).toMatchObject({
			kind: 'changed',
			diffs: ['教室']
		});
	});

	it('takes a row matched to the shared course a synced one reads as the same', () => {
		const synced = course({ synced: true, sharedCourseId: 's1', teachers: ['山田'] });
		expect(compareCourse({ ...read({ teachers: ['別の人'] }), sharedId: 's1' }, ['q1'], [synced]).kind).toBe('same');
	});

	it('only looks in the chosen terms', () => {
		expect(compareCourse(read(), ['q2'], [course({})]).kind).toBe('new');
	});

	it('names another course in the same slot', () => {
		expect(compareCourse(read({ title: '英語' }), ['q1'], [course({})])).toEqual({ kind: 'clash', titles: ['線形代数'] });
	});
});
