import { describe, expect, it } from 'vitest';
import { cleanTitle, groupImported, readImport, splitTeachers } from './import';

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
			{ title: '写真演習I', weekday: 1, period: 3, span: 2, room: 'E10 / E11', teachers: [] },
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

describe('cleanTitle', () => {
	it('writes Roman numeral symbols as the letters they are drawn with', () => {
		expect(cleanTitle('サンプル演習 Ⅱ')).toBe('サンプル演習 II');
		expect(cleanTitle('Sample Eng Ⅳ Com-A')).toBe('Sample Eng IV Com-A');
		expect(cleanTitle('サンプル論Ⅻ')).toBe('サンプル論XII');
		expect(cleanTitle('sample ⅲ')).toBe('sample iii');
		// Letters already are letters
		expect(cleanTitle('Sample Eng IV Com-A')).toBe('Sample Eng IV Com-A');
	});

	it('leaves out the class group the portal adds', () => {
		expect(cleanTitle('Sample Eng IV Com-A (G1)')).toBe('Sample Eng IV Com-A');
		expect(cleanTitle('Sample Eng IV Com-A（Ｇ２）')).toBe('Sample Eng IV Com-A');
		expect(cleanTitle('Sample Eng IV Com-A(g12)')).toBe('Sample Eng IV Com-A');
	});

	it('leaves out 【ｾｯﾄ履修】 however it was misread', () => {
		for (const tag of ['【ｾｯﾄ履修】', '【セット履修】', '【セツト履 修】', '[セット履修]', '［セット履修］', '【ｾｯﾄ履']) {
			expect(cleanTitle(`サンプル演習 II ${tag}`)).toBe('サンプル演習 II');
		}
	});

	it('leaves out several tags, in either order', () => {
		expect(cleanTitle('Sample Eng IV (G1) 【ｾｯﾄ履修】')).toBe('Sample Eng IV');
		expect(cleanTitle('Sample Eng IV 【ｾｯﾄ履修】(G1)')).toBe('Sample Eng IV');
	});

	it('keeps brackets and parentheses that are part of the name', () => {
		expect(cleanTitle('【前期】サンプル演習')).toBe('【前期】サンプル演習');
		expect(cleanTitle('サンプル演習【A】')).toBe('サンプル演習【A】');
		expect(cleanTitle('サンプル(G1)入門')).toBe('サンプル(G1)入門');
		expect(cleanTitle('Group (Gallery) Design')).toBe('Group (Gallery) Design');
	});
});

describe('readImport titles', () => {
	it('cleans titles before joining, so the same course read two ways is one course', () => {
		const answer = {
			days: ['月', '火'],
			rows: [
				{ period: 3, cells: [cell('サンプル演習 Ⅱ 【ｾｯﾄ履修】', 'E10'), cell('Sample Eng Ⅳ Com-A (G1)', '', '山田')] },
				{ period: 4, cells: [cell('サンプル演習 II 【セット履修】', 'E10'), empty] },
				{ period: 5, cells: [empty, cell('(G1)')] }
			]
		};
		expect(readImport(answer)).toEqual([
			{ title: 'サンプル演習 II', weekday: 1, period: 3, span: 2, room: 'E10', teachers: [] },
			{ title: 'Sample Eng IV Com-A', weekday: 2, period: 3, span: 1, room: '', teachers: ['山田'] }
		]);
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
