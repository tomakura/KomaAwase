// How much CPU a page takes in the Worker as deployed: the bundle wrangler makes, run in Node
// with D1 as a thin stand-in over node:sqlite (a copy of the local database). Workers can't
// be profiled locally, and wrangler's own D1 proxy would drown the numbers.
//   npx wrangler deploy --dry-run --outdir .bench     (after npm run build)
//   node --no-warnings scripts/bench-worker.mjs <session token> [paths…]
// FIRST=1 times only the first request of a fresh process, like a Worker that just started.
// Needs Node 22.16 or later (node:sqlite without a flag, and setReturnArrays).
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (typeof DatabaseSync.prototype.constructor !== 'function' || !('setReturnArrays' in new DatabaseSync(':memory:').prepare('select 1'))) {
	console.error('This needs Node 22.16 or later.');
	process.exit(1);
}

// The bundle's one outside import, `env` from cloudflare:workers
register(
	'data:text/javascript,' +
		encodeURIComponent(`export async function resolve(s, c, next) {
			return s === 'cloudflare:workers' ? { url: 'data:text/javascript,export%20const%20env%3D%7B%7D%3B', shortCircuit: true } : next(s, c);
		}`)
);
// The Workers cache the adapter looks in first, always empty here
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };

const [token = '', ...args] = process.argv.slice(2);
const paths = args.length ? args : ['/login', '/', '/overlay', '/friends', '/more', '/courses/search', '/export'];
const ROUNDS = 100;

const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const source = readdirSync(dir)
	.filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
	.map((f) => join(dir, f))
	.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const copy = join(tmpdir(), `koma-bench-${process.pid}.sqlite`);
new DatabaseSync(source).exec(`VACUUM INTO '${copy.split('\\').join('/')}'`);
const sqlite = new DatabaseSync(copy);

// Just what drizzle-orm/d1 calls
class Statement {
	constructor(sql, params = []) {
		this.sql = sql;
		this.params = params;
	}
	bind(...params) {
		return new Statement(this.sql, params);
	}
	#prepared(arrays = false) {
		const statement = sqlite.prepare(this.sql);
		statement.setReturnArrays(arrays);
		return statement;
	}
	async all() {
		return { results: this.#prepared().all(...this.params), success: true, meta: {} };
	}
	async raw() {
		return this.#prepared(true).all(...this.params);
	}
	async first(column) {
		const row = this.#prepared().get(...this.params) ?? null;
		return column && row ? row[column] : row;
	}
	async run() {
		const result = this.#prepared().run(...this.params);
		return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
	}
}
const DB = {
	prepare: (sql) => new Statement(sql),
	async batch(statements) {
		sqlite.exec('begin');
		try {
			const out = [];
			for (const s of statements) out.push(/^\s*(insert|update|delete)/i.test(s.sql) ? await s.run() : await s.all());
			sqlite.exec('commit');
			return out;
		} catch (e) {
			sqlite.exec('rollback');
			throw e;
		}
	}
};
const env = { DB, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const started = performance.now();
const worker = (await import(pathToFileURL(join('.bench', 'entry.js')).href)).default;
const loaded = performance.now() - started;

async function once(path) {
	const request = new Request(`https://koma.tomakura.com${path}`, { headers: token ? { cookie: `session=${token}` } : {} });
	const response = await worker.fetch(request, env, ctx);
	await response.text();
	return response.status;
}

if (process.env.FIRST) {
	const t = performance.now();
	const status = await once(paths[0]);
	console.log(`${paths[0].padEnd(18)} ${status}  load ${loaded.toFixed(1)}ms  first request ${(performance.now() - t).toFixed(1)}ms`);
} else {
	// Windows counts CPU in 15.6ms steps, so the rounds are timed together and averaged.
	for (const path of paths) {
		const status = await once(path);
		for (let i = 0; i < 10; i++) await once(path);
		const before = process.cpuUsage();
		for (let i = 0; i < ROUNDS; i++) await once(path);
		const used = process.cpuUsage(before);
		console.log(`${path.padEnd(18)} ${status}  ${((used.user + used.system) / 1000 / ROUNDS).toFixed(2).padStart(6)}ms`);
	}
}
sqlite.close();
rmSync(copy, { force: true });
process.exit(0);
