# Wedding Invitation

A single-page wedding invitation built with SvelteKit, Tailwind CSS 4, and TypeScript. Statically deployed to GitHub Pages, with an RSVP flow backed by Cloud Firestore.

## Developing

```sh
pnpm install
cp .env.example .env   # fill in the Firebase web config
pnpm dev
```

## Testing

```sh
pnpm test        # unit + e2e
pnpm test:unit   # vitest
pnpm test:e2e    # playwright
```

The e2e suite builds with the Firebase config blanked out — see `playwright.config.ts` — so it exercises the "RSVPs are not open yet" path and never sends a request to a real Firestore project.

## Building

```sh
pnpm build
pnpm preview
```

## Deploying

Pushes to `main` deploy via `.github/workflows/deploy.yml` to GitHub Pages. The build step reads the `PUBLIC_FIREBASE_*` **repository secrets**; without them the site still deploys, and the RSVP section says RSVPs are not open yet.

## Typefaces

The invitation's faces are declared as Tailwind theme variables in `src/app.css` (`--font-display`, `--font-body`, `--font-names`).

`/fonts/` is a specimen sheet listing every bundled face — the system faces plus the script candidates still being weighed for the hero names. It is a design tool, not part of the invitation: it is `noindex` and disallowed in `robots.txt`, but it is still a public URL, since GitHub Pages has no auth.

Adding a face is three steps:

1. `pnpm add @fontsource/<family>`
2. import it in `src/lib/fonts.css` (use the `latin-400.css` subset unless you need Cyrillic or Greek), or in `src/app.css` if the invitation will actually set copy in it
3. add an entry to `src/lib/lib/fonts.ts`

Two guards catch a face that is listed but never actually bundled, which otherwise fails silently and leaves the specimen on the serif stack:

- `src/lib/lib/fonts.test.ts` checks statically that every family in the manifest has a matching `@import` in either CSS file. Fast, but it infers the npm package name from the family name, so it can be fooled.
- `tests/routes.spec.ts` asks the browser which faces actually loaded. This is the authoritative one. Note that `document.fonts.check()` is useless for this — it reports true for families that do not exist at all.

## RSVP

Guests look themselves up by a 10-character code rather than by name — the code arrives in their invitation link and is the document ID in Firestore.

That one decision carries the whole design. Because the code *is* the capability:

- `firestore.rules` denies `list`, so the guest list cannot be scraped.
- 10 characters of Crockford base32 is ~1.1e15 combinations, so guessing one is not practical.
- A guest cannot write past the seats the couple allotted them, because the rules refuse it — the stepper in the UI is a courtesy, not the guarantee.
- Name search, and with it the entire `Ma. Cristina` / `Maria Cristina` problem, does not exist.

Firestore rules are the security boundary; the client never sees the collection.

| File | What it is |
|---|---|
| `firestore.rules` | The whole security model. Read the comments before editing. |
| `src/lib/rsvp/codes.ts` | Code generation and normalisation. The length is a security parameter. |
| `src/lib/rsvp/rsvp.svelte.ts` | The flow, as state. No Firestore import, so it is testable without a network. |
| `src/lib/rsvp/firebase.client.ts` | The only file that touches Firestore, loaded lazily. |
| `scripts/seed-rsvps.mjs` | Seeds the guest list. See `scripts/README.md`. |

Seeding the guest list, generating the codes, and producing the messages to send:

```sh
pnpm seed --dry-run
pnpm seed
```

Two things to keep in step by hand, because nothing enforces it:

- `wedding.rsvp.deadline` in `src/lib/lib/wedding.ts` and the `isBeforeCutoff()` timestamp in `firestore.rules` must be the same date. The rules cannot read the config file.
- `RESPONSE_FIELDS` in `src/lib/rsvp/types.ts` and `onlyResponseFieldsChanged()` in `firestore.rules` must list the same keys.

## Editing the invitation

All copy and content live in `src/lib/lib/wedding.ts` — names, date, venue, story, events, dress code, RSVP details, and registry links. Replace the placeholders there.

- RSVP contact: `wedding.rsvp.contact` and `wedding.rsvp.contactEmail` are what a guest is shown when their code does not work, which will happen. They are still placeholders.
- OG share image: `node artwork/build-og-image.mjs` regenerates `static/images/og.png`.
- Plant illustrations: see `artwork/README.md`.
