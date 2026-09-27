import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Local secrets for `npm run dev` (see relay/README.md). Not .dev.vars, which
			// `wrangler types` would read into worker-configuration.d.ts.
			adapter: adapter({ platformProxy: { envFiles: ['.dev.local.vars'] } })
		})
	]
});
