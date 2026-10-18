// How well the service is doing, counted per hour (UTC) without anything about who: how many
// times something happened and how long it took in all. Read by 運営 → 数字 and /status.
// Relative imports only, because the Worker's entry file reaches it (through push-queue.ts).

/** The part of a D1 database this needs */
type D1Run = { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } };

export const METRICS = {
	// Pages and actions that ended in a server error
	serverErrors: 'server_errors',
	// Notifications that reached the push service, and the ones that didn't
	pushOk: 'push_ok',
	pushFailed: 'push_failed',
	// Each minute the notifications were looked for (total_ms: how late after the minute began),
	// and the ones 10 seconds or more late
	notifyMinute: 'notify_minute',
	notifyLate: 'notify_late',
	// Screenshots read (total_ms: from upload to done) and the ones that failed
	importOk: 'import_ok',
	importFailed: 'import_failed',
	// Mail that the relay didn't take
	mailFailed: 'mail_failed'
} as const;

export type MetricName = (typeof METRICS)[keyof typeof METRICS];

// How long the counts are kept
export const METRICS_KEEP_DAYS = 30;

export const hourOf = (ms: number) => new Date(ms).toISOString().slice(0, 13);

/** Adds to this hour's count. Never throws: counting must not break what it counts. */
export async function countMetric(db: D1Run, name: MetricName, n = 1, totalMs = 0, now = Date.now()) {
	if (n <= 0) return;
	try {
		await db
			.prepare(
				'INSERT INTO metrics (hour, name, n, total_ms) VALUES (?, ?, ?, ?) ON CONFLICT (hour, name) DO UPDATE SET n = n + excluded.n, total_ms = total_ms + excluded.total_ms'
			)
			.bind(hourOf(now), name, n, Math.round(totalMs))
			.run();
	} catch (e) {
		console.error('metrics: counting failed', e);
	}
}
