import { pendingRequestCount } from '$lib/server/friends';
import type { LayoutServerLoad } from './$types';

// The badge on 友だち. Runs again after form actions, which invalidate everything.
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		signedIn: !!locals.user,
		pendingRequests: locals.user ? await pendingRequestCount(locals.db, locals.user.id) : 0
	};
};
