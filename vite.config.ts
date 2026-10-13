import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { svelteCompilerOptions } from './svelte-compiler-options.ts';

export default defineConfig({
	// SvelteKit does not set Vite's `envPrefix`, so `PUBLIC_` would otherwise be
	// invisible to `import.meta.env`. Setting it here is what lets the Firebase
	// config come from either a local `.env` or the deploy workflow's secrets.
	//
	// Deliberately not using `$env/static/public`: that module's exports are
	// generated only from real `.env` files, so a fresh clone — and the
	// Playwright web server, which runs `pnpm build` — would fail to compile.
	// `import.meta.env` misses resolve to `undefined` instead, which is what
	// lets the RSVP flow degrade gracefully when Firebase is unconfigured.
	envPrefix: ['PUBLIC_'],

	build: {
		// The Firebase SDK lands in one ~560 kB chunk, lazily imported and only
		// fetched once a guest actually uses the RSVP flow. Vite's default 500 kB
		// warning fires on it every build and suggests code-splitting, which is
		// already what happened. Anything genuinely eager that grows past this
		// would still show up.
		chunkSizeWarningLimit: 600
	},

	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: svelteCompilerOptions,

			adapter: adapter({
				pages: 'build',
				assets: 'build',
				strict: true
			})
		})
	]
});
