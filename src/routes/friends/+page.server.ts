import { redirect } from '@sveltejs/kit';
import { acceptRequest, listFriendships, removeFriendship } from '$lib/server/friends';
import { listMyGroups } from '$lib/server/groups';
import { withVerified } from '$lib/server/verify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:friends');
	const [{ friends, incoming, outgoing }, groups] = await Promise.all([
		listFriendships(locals.db, locals.user.id),
		listMyGroups(locals.db, locals.user.id)
	]);
	return {
		friends: await withVerified(locals.db, friends),
		incoming: await withVerified(locals.db, incoming),
		outgoing,
		groups
	};
};

const other = async (request: Request) => String((await request.formData()).get('id') ?? '');

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		await acceptRequest(locals.db, locals.user.id, await other(request));
	},
	// Declining a request and cancelling one's own both remove it.
	remove: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		await removeFriendship(locals.db, locals.user.id, await other(request));
	}
};
