/**
 * Rendered once at build time into flat files — there is no server at runtime.
 *
 * Required by adapter-static's `strict` mode, which refuses to build if any route
 * is not prerenderable. Everything below `/` inherits this, so adding a page
 * (RSVP, travel) needs no change here: it is prerendered too.
 */
export const prerender = true;

/**
 * GitHub Pages only resolves `/foo/index.html`. A request for `/foo` gets a 301
 * to `/foo/`, which then 404s — so the default `never`, which emits `foo.html`,
 * serves a bare page fine in dev and 404s in production. `always` writes
 * directory indexes instead.
 *
 * A no-op for the single page we have today (both settings write `index.html` at
 * the root), and here to keep a second page from shipping broken.
 *
 * This is a page option, not a `kit` config option — passing it to `sveltekit()`
 * is only a warning, and it is then ignored.
 */
export const trailingSlash = 'always';
