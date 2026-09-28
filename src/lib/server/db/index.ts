import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// One per binding: drizzle works out the schema's relations each time it's made, which
// every request was paying for. The binding stays the same for the life of the isolate.
const made = new WeakMap<D1Database, ReturnType<typeof make>>();
const make = (d1: D1Database) => drizzle(d1, { schema });

export function getDb(d1: D1Database) {
	let db = made.get(d1);
	if (!db) made.set(d1, (db = make(d1)));
	return db;
}

export type Db = ReturnType<typeof getDb>;
