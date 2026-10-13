import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { svelteCompilerOptions } from './svelte-compiler-options.ts';

export default defineConfig({
	// This file replaces `vite.config.ts` rather than merging with it, so the
	// Svelte plugin has to be re-declared here. Without it the runes transform
	// never runs and `$state` in `src/lib/rsvp/rsvp.svelte.ts` is a bare global.
	//
	// `configFile: false` because this project keeps its Svelte config inside
	// `vite.config.ts` and has no `svelte.config.js`. Without it the plugin logs a
	// "no Svelte config found" warning on every test run.
	plugins: [svelte({ configFile: false, compilerOptions: svelteCompilerOptions })],

	test: {
		include: ['src/**/*.test.ts']
	}
});