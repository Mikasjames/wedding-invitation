import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// GitHub Pages has no server: the invitation is fully rendered at build
			// time into flat files under `build/`, which the deploy workflow uploads
			// as a Pages artifact. The HTML in index.html is what WhatsApp, iMessage
			// and Facebook read when they unfurl the link — none of them run JS, so
			// `ssr: false` here would leave every link preview blank. Prerendering
			// keeps the previews while still shipping zero server.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				// Fail the build if any route is not prerenderable, rather than
				// silently shipping a page that 404s. Enforced via `prerender` in
				// src/routes/+layout.ts.
				strict: true
			})
		})
	]
});
