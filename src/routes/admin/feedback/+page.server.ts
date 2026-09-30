import { and, count, desc, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { feedback, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Pages by ?page=2, oldest open items included.
const PAGE = 50;

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
				createdAt: feedback.createdAt,
				sender: users.nickname,
				senderEmail: users.email
			})
			.from(feedback)
			.leftJoin(users, eq(users.id, feedback.userId))
			.where(eq(feedback.status, 'open'))
			.orderBy(desc(feedback.createdAt), desc(feedback.id))
			.limit(PAGE)
			.offset((page - 1) * PAGE),
		locals.db.select({ n: count() }).from(feedback).where(eq(feedback.status, 'open'))
	]);
	return { feedback: rows, pageSize: PAGE, page, total: total?.n ?? 0 };
};

export const actions: Actions = {
	closeFeedback: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db.update(feedback).set({ status: 'closed' }).where(and(eq(feedback.id, id), eq(feedback.status, 'open')));
	}
};
