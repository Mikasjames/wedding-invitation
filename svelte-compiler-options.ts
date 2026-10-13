/**
 * Svelte compiler options, shared by the Vite and Vitest configs.
 *
 * `vitest.config.ts` replaces `vite.config.ts` rather than merging with it, so
 * without this the test run would not go through the Svelte plugin at all — and
 * `$state` in a `.svelte.ts` module would be an undefined global rather than a
 * rune. Every config that compiles project source must use these.
 */
export const svelteCompilerOptions = {
	runes: ({ filename }: { filename: string }) =>
		filename.split(/[/\\]/).includes('node_modules') ? undefined : true
};