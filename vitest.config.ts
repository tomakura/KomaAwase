import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Unit tests for plain modules; they don't need the SvelteKit plugin, only $lib. The Svelte
// plugin is here for the .svelte.ts modules (state written with runes).
export default defineConfig({
	plugins: [svelte()],
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { include: ['src/**/*.test.ts'] }
});
