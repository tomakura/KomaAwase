import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for plain modules; they don't need the SvelteKit plugin, only $lib.
export default defineConfig({
	resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { include: ['src/**/*.test.ts'] }
});
