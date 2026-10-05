import { and, desc, gte, inArray, isNull, lt, min, count, or, eq, gt } from 'drizzle-orm';
import type { Db } from './db';
import { importJobs, metrics, statusNotes } from './db/schema';
import { METRICS, METRICS_KEEP_DAYS, hourOf } from './metrics';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ふつう / 遅れ気味 / 止まっている
export type Level = 'ok' | 'slow' | 'down';
export type Signal = { id: 'import' | 'push' | 'errors'; label: string; level: Level; text: string };

// The counts of the last two hours (this one and the one before), by name
async function recentCounts(db: Db, now: number) {
	const rows = await db
		.select({ name: metrics.name, n: metrics.n, totalMs: metrics.totalMs })
		.from(metrics)
		.where(inArray(metrics.hour, [hourOf(now), hourOf(now - HOUR)]));
	const out = new Map<string, { n: number; totalMs: number }>();
	for (const r of rows) {
		const had = out.get(r.name) ?? { n: 0, totalMs: 0 };
		out.set(r.name, { n: had.n + r.n, totalMs: had.totalMs + r.totalMs });
	}
	return out;
}

/** The levels /status shows, from counts only: no one's data */
export async function signals(db: Db, now = Date.now()): Promise<Signal[]> {
	const [counts, waiting] = await Promise.all([
		recentCounts(db, now),
		db
			.select({ n: count(), oldest: min(importJobs.createdAt) })
			.from(importJobs)
			.where(inArray(importJobs.status, ['queued', 'processing']))
			.get()
	]);
	const n = (name: string) => counts.get(name)?.n ?? 0;

	// Screenshots: how long the oldest one waiting has waited
	const waitMin = waiting?.n && waiting.oldest ? Math.floor((now - waiting.oldest.getTime()) / 60000) : 0;
	const importSignal: Signal = {
		id: 'import',
		label: 'スクショの読み取り',
		level: waitMin >= 60 ? 'down' : waitMin >= 15 ? 'slow' : 'ok',
		text: waiting?.n ? `${waiting.n}件待ち・最も長い待ち ${waitMin}分` : '待ちはありません'
	};

	const ok = n(METRICS.pushOk);
	const failed = n(METRICS.pushFailed);
	const rate = ok + failed ? failed / (ok + failed) : 0;
	const pushSignal: Signal = {
		id: 'push',
		label: '通知',
		level: ok + failed < 5 ? 'ok' : rate >= 0.5 ? 'down' : rate >= 0.1 ? 'slow' : 'ok',
		text: ok + failed ? `直近2時間で ${Math.round((ok / (ok + failed)) * 100)}% 届きました` : '直近2時間に送った通知はありません'
	};

	const errors = n(METRICS.serverErrors);
	const errorSignal: Signal = {
		id: 'errors',
		label: 'ページの表示',
		level: errors >= 50 ? 'down' : errors >= 5 ? 'slow' : 'ok',
		text: errors ? `直近2時間でエラー ${errors}件` : 'エラーはありません'
	};
	return [importSignal, pushSignal, errorSignal];
}

/** Notices still open, and ones resolved in the last week */
export function loadNotes(db: Db, now = Date.now()) {
	return db
		.select({ id: statusNotes.id, level: statusNotes.level, body: statusNotes.body, createdAt: statusNotes.createdAt, resolvedAt: statusNotes.resolvedAt })
		.from(statusNotes)
		.where(or(isNull(statusNotes.resolvedAt), gt(statusNotes.resolvedAt, new Date(now - 7 * DAY))))
		.orderBy(desc(statusNotes.createdAt))
		.limit(20);
}

export function resolveNote(db: Db, id: string) {
	return db.update(statusNotes).set({ resolvedAt: new Date() }).where(and(eq(statusNotes.id, id), isNull(statusNotes.resolvedAt)));
}

/** The counts per day (UTC hours summed into Japan days) for the last week, for 運営 */
export async function dailyQuality(db: Db, now = Date.now()) {
	const rows = await db
		.select({ hour: metrics.hour, name: metrics.name, n: metrics.n, totalMs: metrics.totalMs })
		.from(metrics)
		.where(gte(metrics.hour, hourOf(now - 7 * DAY)));
	const days = new Map<string, Record<string, { n: number; totalMs: number }>>();
	for (const r of rows) {
		// The hour's start in Japan time
		const day = new Date(Date.parse(`${r.hour}:00:00Z`) + 9 * HOUR).toISOString().slice(0, 10);
		const byName = days.get(day) ?? {};
		const had = byName[r.name] ?? { n: 0, totalMs: 0 };
		byName[r.name] = { n: had.n + r.n, totalMs: had.totalMs + r.totalMs };
		days.set(day, byName);
	}
	return [...days.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([day, m]) => {
			const get = (name: string) => m[name] ?? { n: 0, totalMs: 0 };
			const importOk = get(METRICS.importOk);
			return {
				day,
				errors: get(METRICS.serverErrors).n,
				pushOk: get(METRICS.pushOk).n,
				pushFailed: get(METRICS.pushFailed).n,
				importOk: importOk.n,
				importFailed: get(METRICS.importFailed).n,
				importAvgMin: importOk.n ? Math.round(importOk.totalMs / importOk.n / 60000) : null,
				mailFailed: get(METRICS.mailFailed).n
			};
		});
}

/** For the daily sweep: counts older than METRICS_KEEP_DAYS go */
export function sweepMetrics(db: Db, now = Date.now()) {
	return db.delete(metrics).where(lt(metrics.hour, hourOf(now - METRICS_KEEP_DAYS * DAY)));
}
