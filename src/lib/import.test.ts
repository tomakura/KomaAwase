import { describe, expect, it } from 'vitest';
import { groupImported, readImport, splitTeachers } from './import';

const empty = { title: '', room: '', teacher: '' };
const cell = (title: string, room = '', teacher = '') => ({ title, room, teacher });

describe('readImport', () => {
	it('marks courses from a row that does not match the headings, and keeps the teachers of both halves', () => {
		const answer = {
			days: ['月', '火'],
			rows: [
				{ period: 1, cells: [cell('演習', 'A1'), empty] },
				{ period: 2, cells: [cell('演習', '', '田中'), empty] },
				{ period: 3, cells: [empty, empty, cell('ゼミ')] }
			]
		};
		expect(readImport(answer)).toEqual([
			{ title: '演習', weekday: 1, period: 1, span: 2, room: 'A1', teachers: ['田中'] },
			{ title: 'ゼミ', weekday: 3, period: 3, span: 1, room: '', teachers: [], check: true }
		]);
	});

	it('reads a copied table: weekdays from the headers, double classes joined', () => {
		// What Llama 4 Scout gave for a real screenshot
		const answer = {
			days: ['月', '火', '水', '木', '金'],
			rows: [
				{ period: 1, cells: [empty, empty, empty, empty, empty] },
				{ period: 2, cells: [empty, empty, empty, empty, empty] },
				{ period: 3, cells: [cell('写真演習Ⅰ', 'E10 / E11'), cell('映像制作演習応用A', 'W02'), empty, empty, empty] },
				{
					period: 4,
					cells: [cell('写真演習Ⅰ', 'E10 / E11'), cell('映像制作演習応用A', 'W02'), cell('ネットワーク構築演習基礎', 'E07 / E08'), empty, empty]
				},
				{ period: 5, cells: [empty, cell('映像制作演習基礎A', 'W04'), empty, empty, empty] },
				{ period: 6, cells: [empty, cell('映像制作演習基礎A', 'W04'), cell('エンジニアリテラシー', 'オンライン'), empty, empty] }
			]
		};
		expect(readImport(JSON.stringify(answer))).toEqual([
			{ title: '写真演習Ⅰ', weekday: 1, period: 3, span: 2, room: 'E10 / E11', teachers: [] },
			{ title: '映像制作演習応用A', weekday: 2, period: 3, span: 2, room: 'W02', teachers: [] },
			{ title: '映像制作演習基礎A', weekday: 2, period: 5, span: 2, room: 'W04', teachers: [] },
			{ title: 'ネットワーク構築演習基礎', weekday: 3, period: 4, span: 1, room: 'E07 / E08', teachers: [] },
			{ title: 'エンジニアリテラシー', weekday: 3, period: 6, span: 1, room: 'オンライン', teachers: [] }
		]);
	});

	it('places columns by their headers, even starting midweek or in English', () => {
		const answer = {
			days: ['Wed', '木曜', '?'],
			rows: [{ period: 2, cells: [cell('統計学', '', '山田 太郎、佐藤'), empty, cell('ゼミ')] }]
		};
		expect(readImport(answer)).toEqual([
			{ title: '統計学', weekday: 3, period: 2, span: 1, room: '', teachers: ['山田 太郎', '佐藤'] },
			{ title: 'ゼミ', weekday: 5, period: 2, span: 1, room: '', teachers: [] }
		]);
	});

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

it('splits teachers on 、 and similar, never on a space inside a name', () => {
	expect(splitTeachers('山田 太郎、佐藤　花子,Smith J / 田中')).toEqual(['山田 太郎', '佐藤　花子', 'Smith J', '田中']);
	expect(splitTeachers('  ')).toEqual([]);
});
