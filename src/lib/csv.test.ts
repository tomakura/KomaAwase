import { describe, expect, it } from 'vitest';
import { CSV_TEMPLATE, coursesOfCsv, parseCsv } from './csv';
import { readImport } from './import';

describe('parseCsv', () => {
	it('reads quoted cells, doubled quotes and both kinds of line end', () => {
		expect(parseCsv('﻿a,"b,c","say ""hi"""\r\nd,"e\nf",\n\n')).toEqual([
			['a', 'b,c', 'say "hi"'],
			['d', 'e\nf', '']
		]);
	});
});

describe('coursesOfCsv', () => {
	it('reads the template', () => {
		const { courses, skipped } = coursesOfCsv(parseCsv(CSV_TEMPLATE));
		expect(skipped).toEqual([]);
		expect(readImport({ courses })).toEqual([
			{ title: '線形代数', weekday: 1, period: 2, span: 1, room: 'A101', teachers: ['山田 太郎'], credits: 2 },
			{ title: '英語コミュニケーション', weekday: 3, period: 3, span: 2, room: 'B205', teachers: ['佐藤', '鈴木'], credits: 1 }
		]);
	});

	it('finds columns by heading in any order, and skips rows it cannot read', () => {
		const { courses, skipped } = coursesOfCsv(parseCsv('曜日,科目名,時限\n火曜,物理,３限\n,化学,1\n金,生物,x'));
		expect(courses).toEqual([{ title: '物理', weekday: 2, period: 3, span: 1, room: '', teachers: [] }]);
		expect(skipped).toEqual([3, 4]);
	});

	it('takes the template order without a heading row', () => {
		expect(coursesOfCsv(parseCsv('統計,Thu,4')).courses[0]).toMatchObject({ title: '統計', weekday: 4, period: 4 });
	});
});
