import { dev } from '$app/environment';
import { and, count, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { emailTokens } from '$lib/server/db/schema';
import { generateToken, hashToken } from './token';

const TOKEN_LIFETIME = 15 * 60 * 1000;
// At most this many live links per address, so one address can't be mail-bombed.
const MAX_LIVE_TOKENS_PER_EMAIL = 3;

export function normalizeEmail(input: string): string | null {
	const email = input.trim().toLowerCase();
	// Deliberately loose: the sign-in link proves the address works.
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Returns null when the address already has too many unused links. */
export async function createEmailToken(db: Db, email: string): Promise<string | null> {
	const now = new Date();
	await db.delete(emailTokens).where(lt(emailTokens.expiresAt, now));
	const live = await db
		.select({ n: count() })
		.from(emailTokens)
		.where(and(eq(emailTokens.email, email), gt(emailTokens.expiresAt, now)))
		.get();
	if ((live?.n ?? 0) >= MAX_LIVE_TOKENS_PER_EMAIL) return null;

	const token = generateToken();
	await db.insert(emailTokens).values({
		id: await hashToken(token),
		email,
		expiresAt: new Date(Date.now() + TOKEN_LIFETIME)
	});
	return token;
}

/** Returns the email for a valid token and deletes it so the link works once. */
export async function consumeEmailToken(db: Db, token: string): Promise<string | null> {
	const id = await hashToken(token);
	const row = await db.delete(emailTokens).where(eq(emailTokens.id, id)).returning().get();
	if (!row || row.expiresAt.getTime() <= Date.now()) return null;
	return row.email;
}

export async function sendSignInEmail(env: Env, to: string, link: string) {
	// `npm run dev` runs on Node, where cloudflare:sockets (SMTP) doesn't exist.
	if (dev) {
		console.log(`[dev] sign-in link for ${to}: ${link}`);
		return;
	}
	if (!env.SMTP_HOST || !env.SMTP_PASSWORD) throw new Error('SMTP is not configured');

	// Imported lazily so the Node dev server never loads cloudflare:sockets.
	const { WorkerMailer } = await import('worker-mailer');
	const port = Number(env.SMTP_PORT);
	await WorkerMailer.send(
		{
			host: env.SMTP_HOST,
			port,
			// 465 is TLS from the start; 587 upgrades with STARTTLS.
			secure: port === 465,
			startTls: true,
			socketTimeoutMs: 10_000,
			responseTimeoutMs: 10_000,
			credentials: { username: env.MAIL_FROM, password: env.SMTP_PASSWORD },
			authType: ['plain', 'login']
		},
		{
			from: { name: 'コマあわせ', email: env.MAIL_FROM },
			to,
			subject: 'コマあわせのログイン用リンク',
			text: [
				'コマあわせにログインするには、下のリンクを開いてください。',
				'',
				link,
				'',
				'リンクは15分間、1回だけ使えます。',
				'このメールに心当たりがない場合は、何もせずに削除してください。'
			].join('\n')
		}
	);
}
