// For tests: the app's database (drizzle over D1) on Node's own SQLite, in memory, with every
// migration applied. It answers the parts of D1 that drizzle uses. Not used by the app.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '$lib/server/db';

// D1 takes booleans and undefined; SQLite here takes numbers and null
const value = (v: unknown) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

// drizzle reads a batch's rows by key order, as D1 returns them: two columns with the same name,
// or a name like "0" (which comes first), would put values in the wrong fields.
function checkKeys(sql: string, columns: number | undefined, row: Record<string, unknown> | undefined) {
	if (!row) return;
	const keys = Object.keys(row);
	if ((columns !== undefined && keys.length !== columns) || keys.some((k) => /^\d+$/.test(k))) {
		throw new Error(`Columns of a batched read would be mixed up (${keys.join(', ')}): ${sql}`);
	}
}

// columns() is Node 22.16 or later; before that a read is run again as arrays to count them
// (not a write with `returning`, which would write twice).
function columnCount(s: ReturnType<DatabaseSync['prepare']>, values: unknown[], writes: boolean) {
	if (s.columns) return s.columns().length;
	if (writes) return undefined;
	s.setReturnArrays(true);
	const row = (s.all(...values) as unknown[][])[0];
	s.setReturnArrays(false);
	return row?.length;
}

export function testDatabase() {
	const sqlite = new DatabaseSync(':memory:');
	const dir = new URL('../../drizzle/', import.meta.url);
	for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort()) {
		for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) {
			if (statement.trim()) sqlite.exec(statement);
		}
	}

	function statement(sql: string, values: unknown[] = []) {
		const run = () => {
			const s = sqlite.prepare(sql);
			return { s, values: values.map(value) };
		};
		const all = () => {
			const { s, values } = run();
			return s.all(...values) as Record<string, unknown>[];
		};
		return {
			bind: (...next: unknown[]) => statement(sql, next),
			all: async () => ({ results: all(), success: true, meta: {} }),
			raw: async () => {
				const { s, values } = run();
				s.setReturnArrays(true);
				return s.all(...values) as unknown[][];
			},
			first: async () => all()[0] ?? null,
			run: async () => {
				const { s, values } = run();
				const result = s.run(...values) as { changes: number | bigint };
				return { results: [], success: true, meta: { changes: Number(result.changes) } };
			},
			// In a batch: rows for a statement that reads, the count of changes for one that writes
			execute: () => {
				const { s, values } = run();
				if (/^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql)) {
					const results = s.all(...values) as Record<string, unknown>[];
					checkKeys(sql, columnCount(s, values, /\breturning\b/i.test(sql)), results[0]);
					return { results, success: true, meta: {} };
				}
				const result = s.run(...values) as { changes: number | bigint };
				return { results: [], success: true, meta: { changes: Number(result.changes) } };
			}
		};
	}

	const d1 = {
		prepare: (sql: string) => statement(sql),
		// All or nothing, as D1 runs a batch
		batch: async (statements: ReturnType<typeof statement>[]) => {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((s) => s.execute());
				sqlite.exec('COMMIT');
				return results;
			} catch (e) {
				sqlite.exec('ROLLBACK');
				throw e;
			}
		},
		exec: async (sql: string) => sqlite.exec(sql)
	};
	const db = getDb(d1 as unknown as D1Database);
	const run = (sql: string, ...values: unknown[]) => sqlite.prepare(sql).run(...values.map(value));
	const rows = (sql: string, ...values: unknown[]) => sqlite.prepare(sql).all(...values.map(value)) as Record<string, unknown>[];
	return { db, d1, run, rows };
}
