import { error } from '@sveltejs/kit';
import { listUsers } from '$lib/server/moderation';
import type { PageServerLoad } from './$types';

// The people using the app, for whoever runs it: find one by nickname or address (/admin/users/[id]).
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user?.role !== 'admin') error(404, 'Not found');
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), 1000);
	return { q, page, ...(await listUsers(locals.db, q, page)) };
};
