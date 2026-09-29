import { pendingRequestCount } from '$lib/server/friends';
import { pushEnabled } from '$lib/server/notify';
import type { LayoutServerLoad } from './$types';

// The badge on 友だち. Runs again after form actions, which invalidate everything.
export const load: LayoutServerLoad = async ({ locals, platform }) => {
	return {
		signedIn: !!locals.user,
		// For the screen that suggests turning notifications on (NotifyPrompt)
		setupDone: !!locals.user?.setupAt,
		pushKey: locals.user && pushEnabled(platform?.env) ? (platform?.env.VAPID_PUBLIC_KEY ?? null) : null,
		pendingRequests: locals.user ? await pendingRequestCount(locals.db, locals.user.id) : 0
	};
};
