// What /api/status answers (src/routes/api/status/+server.ts), for /status and the strip at
// the top of the app while there is trouble
export type StatusLevel = 'ok' | 'slow' | 'down';
export type StatusNote = { id: string; level: 'info' | 'trouble'; body: string; createdAt: number; resolvedAt: number | null };
export type StatusSignal = { id: string; label: string; level: StatusLevel; text: string };
export type StatusAnswer = { notes: StatusNote[]; signals: StatusSignal[]; at: number };

// The status page (UptimeFlare, from the KomaAwase-Status repository): checks each minute and
// the notices from 運営 (src/lib/server/status-page.ts)
export const STATUS_PAGE_URL = 'https://status.koma.tomakura.com';

export const LEVEL_LABELS: Record<StatusLevel, string> = { ok: 'ふつう', slow: '遅れ気味', down: '止まっている' };
export const NOTE_LABELS: Record<StatusNote['level'], string> = { info: 'お知らせ', trouble: '障害' };

export async function fetchStatus(fetcher: typeof fetch = fetch): Promise<StatusAnswer | null> {
	try {
		const res = await fetcher('/api/status', { cache: 'no-store' });
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
}
