import { count, desc, eq, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { notifyLater } from '$lib/server/notify';
import { requireAdmin } from '$lib/server/auth/reauth';
import { feedback, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Pages by ?page=2, oldest open items included.
const PAGE = 50;
// Not finished with: 受付 and 対応中
const OPEN: ('open' | 'doing')[] = ['open', 'doing'];
const STATUSES = ['open', 'doing', 'closed', 'declined'] as const;
const REPLY_MAX = 1000;

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), 1000);
	const [rows, [total]] = await locals.db.batch([
		locals.db
			.select({
				id: feedback.id,
				kind: feedback.kind,
				body: feedback.body,
				env: feedback.env,
				status: feedback.status,
				reply: feedback.reply,
				createdAt: feedback.createdAt,
				sender: users.nickname,
				senderEmail: users.email
			})
			.from(feedback)
			.leftJoin(users, eq(users.id, feedback.userId))
			.where(inArray(feedback.status, OPEN))
			.orderBy(desc(feedback.createdAt), desc(feedback.id))
			.limit(PAGE)
			.offset((page - 1) * PAGE),
		locals.db.select({ n: count() }).from(feedback).where(inArray(feedback.status, OPEN))
	]);
	return { feedback: rows, pageSize: PAGE, page, total: total?.n ?? 0 };
};

export const actions: Actions = {
	// The state the sender sees, and a word to them; a new or changed word is notified
	update: async ({ locals, request, url, platform }) => {
		await requireAdmin(locals, url);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = STATUSES.find((s) => s === form.get('status'));
		const reply = String(form.get('reply') ?? '').trim();
		if (!status) return fail(400, { message: '状態を選んでください', id });
		if ([...reply].length > REPLY_MAX) return fail(400, { message: `返事は${REPLY_MAX}文字までです`, id });
		const before = await locals.db.select({ userId: feedback.userId, reply: feedback.reply }).from(feedback).where(eq(feedback.id, id)).get();
		if (!before) return fail(404, { message: '見つかりません', id });
		const replied = !!reply && reply !== (before.reply ?? '');
		await locals.db
			.update(feedback)
			.set({ status, reply: reply || null, ...(replied ? { repliedAt: new Date() } : reply ? {} : { repliedAt: null }) })
			.where(eq(feedback.id, id));
		if (replied && before.userId) {
			notifyLater(platform, locals.db, [before.userId], 'feedbackReply', {
				title: '運営から返事が来ました',
				body: '送った不具合・要望への返事です',
				url: '/feedback#sent',
				tag: `feedback-${id}`
			});
		}
		return { saved: id };
	}
};
