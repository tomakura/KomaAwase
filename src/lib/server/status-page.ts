import { desc, gt } from 'drizzle-orm';
import type { Db } from './db';
import { statusNotes } from './db/schema';
import { NOTE_LABELS } from '$lib/status';

const DAY = 24 * 60 * 60 * 1000;
// UptimeFlare keeps 90 days of checks; its 障害履歴 shows the notices of the same span
const KEEP_DAYS = 90;
const CONFIG = 'uptime.config.ts';
// The notices live between these lines of the status repository's uptime.config.ts. They can't
// go in a file of their own: UptimeFlare's update from upstream replaces every other file.
export const START = '// komaawase:notices:start';
export const END = '// komaawase:notices:end';

type Note = {
	level: 'info' | 'trouble';
	body: string;
	createdAt: Date;
	resolvedAt: Date | null;
};

/** The notices as UptimeFlare's `maintenances` (shown at the top while open, and in its history) */
export function noticesBlock(notes: Note[]) {
	const list = notes.map((n) => ({
		title: NOTE_LABELS[n.level],
		body: n.body,
		start: n.createdAt.toISOString(),
		...(n.resolvedAt ? { end: n.resolvedAt.toISOString() } : {}),
		color: n.level === 'trouble' ? 'red' : 'yellow'
	}));
	return `${START}\nconst notices: MaintenanceConfig[] = ${JSON.stringify(list, null, 2)}\n${END}`;
}

/** `config` with the block between the markers swapped for `block`; null without the markers */
export function replaceBlock(config: string, block: string) {
	const from = config.indexOf(START);
	const to = config.indexOf(END, from);
	if (from < 0 || to < 0) return null;
	return config.slice(0, from) + block + config.slice(to + END.length);
}

const fromBase64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const toBase64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(''));

/**
 * Writes the notices of the last 90 days into the status page's config, which deploys it. 'off'
 * without the token; 'failed' when GitHub said no (運営 is told, and can send them again).
 */
export async function syncNotices(env: Env | undefined, db: Db, fetcher: typeof fetch = fetch): Promise<'done' | 'off' | 'failed'> {
	if (!env?.STATUS_GITHUB_TOKEN || !env.STATUS_REPO) return 'off';
	const notes = await db
		.select({
			level: statusNotes.level,
			body: statusNotes.body,
			createdAt: statusNotes.createdAt,
			resolvedAt: statusNotes.resolvedAt
		})
		.from(statusNotes)
		.where(gt(statusNotes.createdAt, new Date(Date.now() - KEEP_DAYS * DAY)))
		.orderBy(desc(statusNotes.createdAt))
		.limit(100);
	const url = `https://api.github.com/repos/${env.STATUS_REPO}/contents/${CONFIG}`;
	const headers = {
		authorization: `Bearer ${env.STATUS_GITHUB_TOKEN}`,
		accept: 'application/vnd.github+json',
		'user-agent': 'komaawase',
		'x-github-api-version': '2022-11-28'
	};
	// Twice: a save made at the same moment changes the file under us (409)
	for (let tries = 0; tries < 2; tries++) {
		try {
			const got = await fetcher(url, { headers });
			if (!got.ok) return 'failed';
			const file = (await got.json()) as { sha: string; content: string };
			const before = fromBase64(file.content);
			const after = replaceBlock(before, noticesBlock(notes));
			if (after === null) return 'failed';
			if (after === before) return 'done';
			const put = await fetcher(url, {
				method: 'PUT',
				headers,
				body: JSON.stringify({
					message: '運営のお知らせを更新',
					content: toBase64(after),
					sha: file.sha
				})
			});
			if (put.ok) return 'done';
			if (put.status !== 409) return 'failed';
		} catch {
			return 'failed';
		}
	}
	return 'failed';
}
