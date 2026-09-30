import { pendingRequestCount } from '$lib/server/friends';
import { pendingWarning } from '$lib/server/moderation';
import { pushEnabled } from '$lib/server/notify';
import { verifyPromptFor } from '$lib/server/verify';
import type { LayoutServerLoad } from './$types';

// The badge on 友だち. Runs again after form actions, which invalidate everything.
export const load: LayoutServerLoad = async ({ locals, platform }) => {
	return {
		signedIn: !!locals.user,
		// For the screen that suggests turning notifications on (NotifyPrompt)
		setupDone: !!locals.user?.setupAt,
		pushKey: locals.user && pushEnabled(platform?.env) ? (platform?.env.VAPID_PUBLIC_KEY ?? null) : null,
		pendingRequests: locals.user ? await pendingRequestCount(locals.db, locals.user.id) : 0,
		// The screen that suggests confirming enrollment (VerifyPrompt)
		verifyPrompt: locals.user ? await verifyPromptFor(locals.db, locals.user) : null,
		// A warning from an admin, shown over everything until it is answered (WarningScreen)
		warning: (locals.user && (await pendingWarning(locals.db, locals.user.id))) || null
	};
};
