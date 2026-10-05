import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';
import { listMyGroups, membership, setShare } from '$lib/server/groups';
import { choiceOf, readShareChoice } from '$lib/sharing';
import type { Actions, PageServerLoad } from './$types';

// 時間割の見せ方: to friends, and to each group, in one place (A14)
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const groups = await listMyGroups(locals.db, locals.user.id);
	return {
		friends: locals.user.friendShare,
		groups: groups.map((g) => ({ id: g.id, name: g.name, share: choiceOf({ shareTimetable: g.share, freeOnly: g.freeOnly }) }))
	};
};

export const actions: Actions = {
	friends: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const share = readShareChoice((await request.formData()).get('share'));
		if (share) await locals.db.update(users).set({ friendShare: share }).where(eq(users.id, locals.user.id));
	},
	group: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const groupId = String(form.get('id') ?? '');
		const share = readShareChoice(form.get('share'));
		if (share && (await membership(locals.db, groupId, locals.user.id))) await setShare(locals.db, groupId, locals.user.id, share);
	}
};
