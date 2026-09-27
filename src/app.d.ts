// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Secrets are not in wrangler.jsonc, so `wrangler types` does not know about them.
	interface Env {
		RELAY_SECRET?: string;
	}

	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties
		}

		// interface Error {}
		interface Locals {
			db: import('$lib/server/db').Db;
			user: import('$lib/server/auth/session').SessionUser | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
