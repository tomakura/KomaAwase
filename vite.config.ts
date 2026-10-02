import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { CSP_DIRECTIVES } from './src/lib/security.ts';

// Fontsource's CSS offers each font as woff2 with a woff fallback. Every browser the app
// runs in takes woff2, so the woff copies are left out of the build.
const woff2Only: Plugin = {
	name: 'woff2-only',
	enforce: 'pre',
	transform(code, id) {
		if (id.includes('/@fontsource/') && id.endsWith('.css')) return code.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, '');
	}
};

export default defineConfig({
	plugins: [
		woff2Only,
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Local secrets for `npm run dev` (see relay/README.md). Not .dev.vars, which
			// `wrangler types` would read into worker-configuration.d.ts.
			adapter: adapter({
				config: 'svelte-kit.wrangler.jsonc',
				platformProxy: { configPath: 'wrangler.jsonc', envFiles: ['.dev.local.vars'] }
			}),
			// The policy is in src/lib/security.ts, where the service worker reads it too
			csp: { mode: 'auto', directives: CSP_DIRECTIVES }
		})
	]
});
