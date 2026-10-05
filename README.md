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

## Editing the invitation

All copy and content live in `src/lib/lib/wedding.ts` — names, date, venue, story, events, dress code, RSVP endpoint, and registry links. Replace the placeholders there.

- RSVP form: point `wedding.rsvp.endpoint` at your form handler (e.g. Formspree).
- OG share image: `node artwork/build-og-image.mjs` regenerates `static/images/og.png`.
- Plant illustrations: see `artwork/README.md`.
