# Wedding Invitation

A single-page wedding invitation built with SvelteKit, Tailwind CSS 4, and TypeScript. Fully static — no backend, deployed to GitHub Pages.

## Developing

```sh
pnpm install
pnpm dev
```

## Testing

```sh
pnpm test        # unit + e2e
pnpm test:unit   # vitest
pnpm test:e2e    # playwright
```

## Building

```sh
pnpm build
pnpm preview
```

## Deploying

Pushes to `main` deploy via `.github/workflows/deploy.yml` to GitHub Pages.

## Typefaces

The invitation's faces are declared as Tailwind theme variables in `src/app.css` (`--font-display`, `--font-body`, `--font-names`).

`/fonts/` is a specimen sheet listing every bundled face — the system faces plus the script candidates still being weighed for the hero names. It is a design tool, not part of the invitation: it is `noindex` and disallowed in `robots.txt`, but it is still a public URL, since GitHub Pages has no auth.

Adding a face is three steps:

1. `pnpm add @fontsource/<family>`
2. import it in `src/lib/fonts.css` (use the `latin-400.css` subset unless you need Cyrillic or Greek), or in `src/app.css` if the invitation will actually set copy in it
3. add an entry to `src/lib/lib/fonts.ts`

`src/lib/lib/fonts.test.ts` fails if a manifest entry has no matching import — otherwise it is a silent failure, and the specimen just falls back to the serif stack.

## Editing the invitation

All copy and content live in `src/lib/lib/wedding.ts` — names, date, venue, story, events, dress code, RSVP endpoint, and registry links. Replace the placeholders there.

- RSVP form: point `wedding.rsvp.endpoint` at your form handler (e.g. Formspree).
- OG share image: `node artwork/build-og-image.mjs` regenerates `static/images/og.png`.
- Plant illustrations: see `artwork/README.md`.
