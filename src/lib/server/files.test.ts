import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteCourse } from './courses';
import { testDatabase } from '../../test/db';

const env = { FILES_URL: 'https://files.example.test/files.php', FILES_SECRET: 'secret' } as unknown as Env;

function world(files: number) {
	const t = testDatabase();
	t.run(`INSERT INTO users (id, email, nickname) VALUES ('u1', 'a@example.test', 'てすと')`);
	t.run(`INSERT INTO timetables (id, user_id, year, name) VALUES ('t1', 'u1', 2026, '2026年度')`);
	t.run(`INSERT INTO courses (id, timetable_id, title) VALUES ('c1', 't1', 'サンプル演習')`);
	for (let i = 0; i < files; i++) {
		t.run(`INSERT INTO course_files (id, course_id, storage_key, name, mime, size) VALUES (?, 'c1', ?, ?, 'application/pdf', 10)`, `f${i}`, `k${i}`, `資料${i}.pdf`);
	}
	return t;
}

// The file storage: deletes each key it is asked to, except the ones that fail
function storage(failing: string[] = []) {
	const deleted: string[] = [];
	vi.stubGlobal('fetch', async (input: URL) => {
		const key = new URL(input).searchParams.get('key')!;
		if (failing.includes(key)) return new Response('busy', { status: 503 });
		deleted.push(key);
		return Response.json({ ok: true });
	});
	return deleted;
}

afterEach(() => vi.unstubAllGlobals());

describe('deleteCourse', () => {
	it('keeps exactly the files still stored when one fails part way, and carries on when tried again', async () => {
		const t = world(3);
		storage(['k1']);
		await expect(deleteCourse(env, t.db, 'u1', 'c1')).rejects.toThrow();
		// k0 went with its row; k1 and k2 are still there and still listed
		expect(t.rows(`SELECT storage_key AS k FROM course_files ORDER BY k`)).toEqual([{ k: 'k1' }, { k: 'k2' }]);
		expect(t.rows(`SELECT count(*) AS n FROM courses`)).toEqual([{ n: 1 }]);
		storage();
		expect(await deleteCourse(env, t.db, 'u1', 'c1')).toBe(true);
		expect(t.rows(`SELECT count(*) AS n FROM courses`)).toEqual([{ n: 0 }]);
	});

	it('deletes 40 files a request and asks to go on with the rest', async () => {
		const t = world(45);
		const deleted = storage();
		expect(await deleteCourse(env, t.db, 'u1', 'c1')).toBe('more');
		expect(deleted).toHaveLength(40);
		expect(t.rows(`SELECT count(*) AS n FROM course_files`)).toEqual([{ n: 5 }]);
		expect(await deleteCourse(env, t.db, 'u1', 'c1')).toBe(true);
		expect(t.rows(`SELECT count(*) AS n FROM course_files`)).toEqual([{ n: 0 }]);
	});
});
