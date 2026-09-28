import { fail } from '@sveltejs/kit';
import { and, count, eq, gte } from 'drizzle-orm';
import { requireUser, safeNext } from '$lib/server/auth/next';
import { feedback } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const BODY_MAX = 2000;
const DAILY_MAX = 10;
const KINDS = ['bug', 'request', 'other'] as const;

export const load: PageServerLoad = ({ locals, url }) => {
	requireUser(locals, url);
	return { from: safeNext(url.searchParams.get('from')) ?? '' };
};

export const actions: Actions = {
	default: async ({ locals, url, request }) => {
		const me = requireUser(locals, url);
		const form = await request.formData();
		const kind = KINDS.find((k) => k === form.get('kind'));
		const body = String(form.get('body') ?? '').trim();
		if (!kind) return fail(400, { message: '種類を選んでください' });
		if (!body || [...body].length > BODY_MAX) return fail(400, { message: `内容は1〜${BODY_MAX}文字で書いてください` });

		const [sent] = await locals.db
			.select({ n: count() })
			.from(feedback)
			.where(and(eq(feedback.userId, me.id), gte(feedback.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
		if ((sent?.n ?? 0) >= DAILY_MAX) return fail(429, { message: '今日はたくさん送っていただきました。また明日お願いします' });

		// Only what the page showed before sending, each value bounded
		let env: Record<string, string> | null = null;
		if (form.get('attach') === 'on') {
			env = {};
			for (const key of ['version', 'userAgent', 'screen', 'page', 'theme']) {
				const value = String(form.get(key) ?? '').slice(0, 300);
				if (value) env[key] = value;
			}
		}
		await locals.db.insert(feedback).values({ userId: me.id, kind, body, env });
		return { sent: true };
	}
};
