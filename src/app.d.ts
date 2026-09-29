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
		// Google sign-in; the button appears once both are set
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		// Notifications (Web Push): the VAPID key pair, base64url (public: raw point, private: d).
		// Without them the notification settings say they aren't available yet.
		VAPID_PUBLIC_KEY?: string;
		VAPID_PRIVATE_KEY?: string;
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
			// The user's timetable for this academic year: null when there is none yet,
			// undefined when it wasn't read with the session (see hooks.server.ts)
			timetable?: import('$lib/server/auth/session').KnownTimetable | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
