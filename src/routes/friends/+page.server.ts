import { redirect } from '@sveltejs/kit';
import { acceptRequest, listFriendships, removeFriendship } from '$lib/server/friends';
import { notifyLater } from '$lib/server/notify';
import { listMyGroups } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:friends');
	const [{ friends, incoming, outgoing }, groups] = await Promise.all([
		listFriendships(locals.db, locals.user.id),
		listMyGroups(locals.db, locals.user.id)
	]);
	return {
		friends,
		incoming,
		outgoing,
		groups
	};
};

const other = async (request: Request) => String((await request.formData()).get('id') ?? '');

export const actions: Actions = {
	accept: async ({ request, locals, platform }) => {
		if (!locals.user) redirect(303, '/login');
		const requester = await other(request);
		if (await acceptRequest(locals.db, locals.user.id, requester)) {
			notifyLater(platform, locals.db, [requester], 'friendAccepted', {
				title: `${locals.user.nickname ?? 'だれか'}さんが友だち申請を承認しました`,
				body: 'おたがいの時間割が見られるようになりました',
				url: `/friends/${locals.user.id}`,
				tag: `friend-${locals.user.id}`
			});
		}
	},
	// Declining a request and cancelling one's own both remove it.
	remove: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		await removeFriendship(locals.db, locals.user.id, await other(request));
	}
};
