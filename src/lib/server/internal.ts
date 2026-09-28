import { error } from '@sveltejs/kit';

// Routes under /internal are only for the Worker's own queue and cron handlers
// (worker/entry.js), which call them in-process with KOMA_INTERNAL set on env. A request
// from outside gets the plain env, so it can't pretend.
export function requireInternal(platform: App.Platform | undefined) {
	if (platform?.env.KOMA_INTERNAL !== true) error(404, 'Not found');
	return platform.env;
}
