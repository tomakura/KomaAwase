// Course names, teachers and rooms typed two ways (full-width spaces, Ａ１) saved and searched one way
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanRoom, cleanText } from '$lib/text';
import { adminSearchShared, loadSharedCourse, writeShared } from './shared-courses';
import { testDatabase } from '../../test/db';

const values = (title: string, teachers: string[], room: string | null) => ({
	title,
	teachers,
	slots: [{ weekday: 1, period: 1, span: 1, week: 'every' as const, room }],
	delivery: null,
	intensiveFrom: null,
	intensiveTo: null,
	credits: 2
});

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name) VALUES ('uni', 'テスト大学')`);
	t.run(`INSERT INTO users (id, email, nickname, university_id) VALUES ('u1', 'a@example.test', 'ひと', 'uni')`);
	return t;
}

describe('cleanText', () => {
	it('makes full-width spaces, letters and digits half-width, and runs of spaces one', () => {
		expect(cleanText('　山田　　太郎 ')).toBe('山田 太郎');
		expect(cleanText('Ｂ－２０３')).toBe('B-203');
		expect(cleanText('英語Ⅱ（再）')).toBe('英語II(再)');
		expect(cleanText('ｶﾞｲﾀﾞﾝｽ')).toBe('ガイダンス');
	});
});

describe('cleanRoom', () => {
	it('writes rooms split by a slash as E15 / E16', () => {
		for (const room of ['E15/E16', 'E15 ／E16', 'E15  /  E16', 'Ｅ１５／Ｅ１６']) expect(cleanRoom(room)).toBe('E15 / E16');
		expect(cleanRoom('B-203')).toBe('B-203');
	});
});

describe('saving and searching shared courses', () => {
	it('saves the title, teachers and rooms cleaned, and a teacher typed twice once', async () => {
		const t = world();
		const w = writeShared(t.db, {
			userId: 'u1',
			universityId: 'uni',
			year: 2026,
			termNames: [],
			existing: null,
			values: values('情報　基礎Ａ', ['山田　太郎', '山田 太郎'], '　Ｂ２０３／Ｂ２０４ ')
		});
		await t.db.batch(w.statements as [never]);
		const saved = await loadSharedCourse(t.db, w.id);
		expect(saved?.values.title).toBe('情報 基礎A');
		expect(saved?.values.teachers).toEqual(['山田 太郎']);
		expect(saved?.values.slots[0].room).toBe('B203 / B204');
	});

	it('finds a course however the spaces and letters are typed', async () => {
		const t = world();
		const w = writeShared(t.db, {
			userId: 'u1',
			universityId: 'uni',
			year: 2026,
			termNames: [],
			existing: null,
			values: values('情報 基礎A', ['山田 太郎'], null)
		});
		await t.db.batch(w.statements as [never]);
		const find = async (q: string) => (await adminSearchShared(t.db, { universityId: 'uni', year: 2026, q })).map((c) => c.id);
		expect(await find('情報基礎Ａ')).toEqual([w.id]);
		expect(await find('山田　太郎')).toEqual([w.id]);
		expect(await find('山田太郎')).toEqual([w.id]);
	});
});

function migrate(t: ReturnType<typeof world>, file: string) {
	const sql = readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), 'utf8');
	for (const s of sql.split('--> statement-breakpoint')) if (s.trim()) t.run(s);
}

describe('migration 0028', () => {
	it('cleans what is already saved as cleanText would', () => {
		const t = world();
		const samples = ['　情報　　基礎Ａ　', '英語Ⅳ（再履修）', 'ｶﾞｲﾀﾞﾝｽ・ﾊﾟｿｺﾝ', 'Ｂ－２０３\t教室', '①数学', 'ふつうの授業'];
		samples.forEach((s, i) => {
			t.run(`INSERT INTO shared_courses (id, university_id, year, title, source) VALUES (?, 'uni', 2026, ?, 'user')`, `c${i}`, s);
			t.run(
				`INSERT INTO shared_course_teachers (id, shared_course_id, name, sort_order) VALUES (hex(randomblob(8)), ?, ?, 0), (hex(randomblob(8)), ?, ?, 1)`,
				`c${i}`,
				s,
				`c${i}`,
				cleanText(s)
			);
			t.run(
				`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES (hex(randomblob(8)), ?, 1, 1, 1, ?)`,
				`c${i}`,
				s
			);
		});
		t.run(`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES ('s2', 'c0', 2, 1, 1, '　')`);
		migrate(t, '0028_clean_course_text.sql');

		samples.forEach((s, i) => {
			const id = `c${i}`;
			expect(t.rows(`SELECT title FROM shared_courses WHERE id = ?`, id)).toEqual([{ title: cleanText(s) }]);
			// The two spellings of one teacher become one
			expect(t.rows(`SELECT name FROM shared_course_teachers WHERE shared_course_id = ?`, id)).toEqual([{ name: cleanText(s) }]);
			expect(t.rows(`SELECT room FROM shared_course_slots WHERE shared_course_id = ? AND weekday = 1`, id)).toEqual([
				{ room: cleanText(s) }
			]);
		});
		expect(t.rows(`SELECT room FROM shared_course_slots WHERE weekday = 2`)).toEqual([{ room: null }]);
	});
});

describe('migration 0029', () => {
	it('writes rooms split by a slash as cleanRoom would', () => {
		const t = world();
		t.run(`INSERT INTO shared_courses (id, university_id, year, title, source) VALUES ('c', 'uni', 2026, '授業', 'user')`);
		const rooms = ['E15/E16', 'E10 / E11', 'E01 /E02', 'E16／ E17', 'B-203', 'A1/A2/A3'];
		rooms.forEach((room, i) =>
			t.run(
				`INSERT INTO shared_course_slots (id, shared_course_id, weekday, period_number, span, room) VALUES (?, 'c', ?, 1, 1, ?)`,
				`s${i}`,
				i + 1,
				room
			)
		);
		migrate(t, '0029_room_slash.sql');
		expect(t.rows(`SELECT room FROM shared_course_slots ORDER BY weekday`).map((r) => r.room)).toEqual(rooms.map(cleanRoom));
	});
});
