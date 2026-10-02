// The database tests (src/test/db.ts, the reminders) run the real migrations on Node's own SQLite
// (node:sqlite, Node 22.13 or later) and read them from disk. @types/node isn't installed, so
// this declares just the parts they use.
declare module 'node:sqlite' {
	export class DatabaseSync {
		constructor(path: string);
		exec(sql: string): void;
		prepare(sql: string): {
			all(...values: unknown[]): unknown[];
			get(...values: unknown[]): unknown;
			run(...values: unknown[]): unknown;
			setReturnArrays(on: boolean): void;
		};
	}
}

declare module 'node:fs' {
	export function readdirSync(path: URL): string[];
	export function readFileSync(path: URL, encoding: 'utf8'): string;
}
