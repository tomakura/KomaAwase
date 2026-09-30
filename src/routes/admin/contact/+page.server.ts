import { and, count, desc, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/reauth';
import { contactMessages } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// Pages by ?page=2, oldest open items included.
const PAGE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals, url);
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), 1000);
	const [rows, [total]] = await locals.db.batch([
		locals.db
			.select({
				id: contactMessages.id,
				name: contactMessages.name,
				email: contactMessages.email,
				body: contactMessages.body,
				createdAt: contactMessages.createdAt
			})
			.from(contactMessages)
			.where(eq(contactMessages.status, 'open'))
			.orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
			.limit(PAGE)
			.offset((page - 1) * PAGE),
		locals.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'open'))
	]);
	return { contact: rows, pageSize: PAGE, page, total: total?.n ?? 0 };
};

export const actions: Actions = {
	closeContact: async ({ locals, request, url }) => {
		await requireAdmin(locals, url);
		const id = String((await request.formData()).get('id') ?? '');
		await locals.db
			.update(contactMessages)
			.set({ status: 'closed' })
			.where(and(eq(contactMessages.id, id), eq(contactMessages.status, 'open')));
	}
};
