// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Secrets are not in wrangler.jsonc, so `wrangler types` does not know about them.
	interface Env {
		RELAY_SECRET?: string;
		FILES_SECRET?: string;
		// The page for supporting development (開発を応援する); the row is hidden without it
		SUPPORT_URL?: string;
		// Screenshot reading with Groq; without it only Workers AI reads them
		GROQ_API_KEY?: string;
		// Set by worker/entry.js on calls it makes to itself (queue and cron), never by requests
		KOMA_INTERNAL?: boolean;
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
