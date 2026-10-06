// The notices from 運営 written into the status page's config (UptimeFlare), with GitHub faked
import { describe, expect, it } from 'vitest';
import { END, START, noticesBlock, replaceBlock, syncNotices } from './status-page';
import { testDatabase } from '../../test/db';

const env = {
	STATUS_REPO: 'tomakura/KomaAwase-Status',
	STATUS_GITHUB_TOKEN: 'token'
} as unknown as Env;
const config = `const a = 1\n${START}\nconst notices: MaintenanceConfig[] = []\n${END}\nconst b = 2\n`;
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(''));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

function github(conflicts = 0) {
	let file = config;
	let sha = 1;
	const puts: string[] = [];
	const fetcher = (async (_url: string, init?: RequestInit) => {
		if (init?.method !== 'PUT') return Response.json({ sha: String(sha), content: b64(file) });
		const body = JSON.parse(String(init.body));
		if (conflicts-- > 0) {
			sha++;
			return new Response('conflict', { status: 409 });
		}
		if (body.sha !== String(sha)) return new Response('stale', { status: 409 });
		file = unb64(body.content);
		sha++;
		puts.push(file);
		return Response.json({});
	}) as typeof fetch;
	return { fetcher, puts, file: () => file };
}

describe('the notices on the status page', () => {
	it('turns notices into maintenances, open ones without an end', () => {
		const block = noticesBlock([
			{
				level: 'trouble',
				body: '読み取りが遅れています',
				createdAt: new Date('2026-10-01T00:00:00Z'),
				resolvedAt: null
			},
			{
				level: 'info',
				body: 'メンテナンス',
				createdAt: new Date('2026-09-01T00:00:00Z'),
				resolvedAt: new Date('2026-09-01T01:00:00Z')
			}
		]);
		const list = JSON.parse(block.slice(block.indexOf('= [') + 2, block.lastIndexOf(']') + 1));
		expect(list).toEqual([
			{
				title: '障害',
				body: '読み取りが遅れています',
				start: '2026-10-01T00:00:00.000Z',
				color: 'red'
			},
			{
				title: 'お知らせ',
				body: 'メンテナンス',
				start: '2026-09-01T00:00:00.000Z',
				end: '2026-09-01T01:00:00.000Z',
				color: 'yellow'
			}
		]);
	});

	it('swaps only the marked lines, and gives up without them', () => {
		expect(replaceBlock(config, `${START}\nX\n${END}`)).toBe(`const a = 1\n${START}\nX\n${END}\nconst b = 2\n`);
		expect(replaceBlock('const a = 1\n', 'X')).toBeNull();
	});

	it('writes the notices into the config, and tries again when the file changed under it', async () => {
		const t = testDatabase();
		t.run(`INSERT INTO status_notes (id, level, body, created_at) VALUES ('n1', 'trouble', '通知が遅れています「」', ${Date.now()})`);
		const gh = github(1);
		expect(await syncNotices(env, t.db, gh.fetcher)).toBe('done');
		expect(gh.puts).toHaveLength(1);
		expect(gh.file()).toContain('"body": "通知が遅れています「」"');
		expect(gh.file()).toMatch(/^const a = 1\n/);
		// Nothing new: no commit
		expect(await syncNotices(env, t.db, gh.fetcher)).toBe('done');
		expect(gh.puts).toHaveLength(1);
	});

	it('stays off without the token, and says when GitHub refuses', async () => {
		const t = testDatabase();
		expect(await syncNotices({ STATUS_REPO: 'tomakura/KomaAwase-Status' } as unknown as Env, t.db, github().fetcher)).toBe('off');
		const refused = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch;
		expect(await syncNotices(env, t.db, refused)).toBe('failed');
	});
});
