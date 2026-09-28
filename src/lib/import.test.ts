import { describe, expect, it } from 'vitest';
import { groupImported, readImport } from './import';

describe('readImport', () => {
	it('takes JSON text or an object', () => {
		const answer = { courses: [{ title: '統計学入門', weekday: 3, period: 1, span: 1, room: 'A-305', teachers: [] }] };
		expect(readImport(JSON.stringify(answer))).toEqual(answer.courses);
		expect(readImport(answer)).toEqual(answer.courses);
	});

	it('rejects answers of the wrong shape', () => {
		expect(readImport('not json')).toBeNull();
		expect(readImport({ lessons: [] })).toBeNull();
	});

	it('drops entries it cannot place and trims the rest', () => {
		const courses = readImport({
			courses: [
				{ title: '  データ構造 ', weekday: 2, period: 2, span: 1, room: ' C-101 ', teachers: ['佐藤', '佐藤', ''] },
				{ title: '', weekday: 1, period: 1, span: 1, room: '', teachers: [] },
				{ title: '日曜の何か', weekday: 8, period: 1, span: 1, room: '', teachers: [] },
				{ title: '変な時限', weekday: 1, period: 40, span: 1, room: '', teachers: [] },
				{ title: '長すぎる', weekday: 1, period: 3, span: 9, room: '', teachers: [] }
			]
		});
		expect(courses).toEqual([
			{ title: '長すぎる', weekday: 1, period: 3, span: 1, room: '', teachers: [] },
			{ title: 'データ構造', weekday: 2, period: 2, span: 1, room: 'C-101', teachers: ['佐藤'] }
		]);
	});

	it('joins the two halves of a double class and skips a slot read twice', () => {
		const courses = readImport({
			courses: [
				{ title: 'プログラミング演習', weekday: 2, period: 3, span: 1, room: 'PC室2', teachers: [] },
				{ title: 'プログラミング演習', weekday: 2, period: 4, span: 1, room: '', teachers: [] },
				{ title: '別の授業', weekday: 2, period: 4, span: 1, room: '', teachers: [] }
			]
		});
		expect(courses).toEqual([{ title: 'プログラミング演習', weekday: 2, period: 3, span: 2, room: 'PC室2', teachers: [] }]);
	});
});

it('groups a course that meets twice a week', () => {
	const groups = groupImported([
		{ title: '線形代数Ⅱ', weekday: 1, period: 2, span: 1, room: 'B-203', teachers: ['田中'] },
		{ title: '線形代数 Ⅱ', weekday: 4, period: 1, span: 1, room: 'B-203', teachers: [] },
		{ title: 'ドイツ語Ⅰ', weekday: 5, period: 3, span: 1, room: '', teachers: [] }
	]);
	expect(groups).toHaveLength(2);
	expect(groups[0].slots.map((s) => `${s.weekday}-${s.period}`)).toEqual(['1-2', '4-1']);
	expect(groups[0].teachers).toEqual(['田中']);
});
