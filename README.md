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

- The deployed ruleset denies `list`, so the guest list cannot be scraped.
- 10 characters of Crockford base32 is ~1.1e15 combinations, so guessing one is not practical.
- A guest cannot write past the seats the couple allotted them, because the rules refuse it — the stepper in the UI is a courtesy, not the guarantee.
- Name search, and with it the entire `Ma. Cristina` / `Maria Cristina` problem, does not exist.

Firestore rules are the security boundary; the client never sees the collection.

| File | What it is |
|---|---|
| `src/lib/rsvp/codes.ts` | Code generation and normalisation. The length is a security parameter. |
| `src/lib/rsvp/message.ts` | The invitation message, and the `{token}` renderer behind it. |
| `src/lib/rsvp/rsvp.svelte.ts` | The flow, as state. No Firestore import, so it is testable without a network. |
| `src/lib/rsvp/firebase.client.ts` | The only file that touches Firestore, loaded lazily. |
| `scripts/seed-rsvps.mjs` | Seeds the guest list. See `scripts/README.md`. |

### The invitation message

Every household gets one message, built by `invitationMessage()`. The wording
lives in `wedding.rsvp.invitation` rather than in `message.ts`, so it can be
rewritten without editing code — `README.md` below on editing copy.

A household can also be given its own message, replacing the shared one
entirely. Set it per household from `/admin`, or per row in the spreadsheet's
`invitation` column. The link is re-attached if their wording omits it, so
nobody can be sent an invitation they cannot open.

The dashboard can write a household's **own** fields — `householdName`,
`seatsAllocated`, `side`, `contactEmail`, `notes`, `active` — and its
`customMessage`. It cannot write a guest's answer: `status`, `partySize`,
`attendeeNames`, `message` and `respondedAt` are not reachable from
`HouseholdEdit`, so there is no path through the interface that could move
them.

That split is the safety property, and it is a property of the shape rather
than of validation to remember. Lowering `seatsAllocated` under a confirmed
`partySize` produces a document that fails `isWellFormed()` and locks that
household out of its own RSVP — they cannot lower their own `partySize` to
escape it, so there is no route back. The dashboard refuses the edit, and so
do the deployed rules, which is what makes it true for any client rather than
only this one.

The deployed ruleset says the same thing independently, which is what makes it
a backstop rather than a convention: the admin arm of `allow update` is a
`hasOnly` over those seven fields and `updatedAt`. That grant used to be a bare
`isWeddingAdmin() ||`, which permitted the lockout above and a `setDoc` that
would erase a guest's answer. See `scripts/README.md` for what it permits now,
and what to never add to it.

Raising a household's seats is never refused. An over-committed document is
fixed by raising the allocation to meet it, so the guard blocks creating the
problem without blocking the repair.

### Firestore rules live in the console

There is no rules file in this repo. The deployed ruleset is edited in Firebase
console → Firestore → Rules, and `firestore.rules` was deleted rather than
deprecated — see `scripts/README.md` for why reconstructing one would be worse
than having none.

Two consequences worth knowing before you change anything:

- **Nothing in git enforces the seat cap.** It is verified by reading the console
  rules and by one manual end-to-end RSVP. There are deliberately no Firestore
  emulator tests, because `@firebase/rules-unit-testing` loads rules from a file
  and there is no file. If the ruleset ever needs automated coverage, exporting it
  here is the first step — and that is a decision, not a cleanup.
- **The admin branch has no copy outside Firebase.** It is the `list` grant that
  lets `/admin` read the collection, and every one of the couple's addresses is
  admitted by email rather than by claim, so none of them carries an admin claim
  in their token. The client deliberately never checks a claim — authorisation
  arrives as a `PERMISSION_DENIED` on the collection load.

Households are created and edited from `/admin`, which is the working surface for
the guest list. Importing a spreadsheet — a first seed, or a restore — goes
through the seed script, which rewrites every household's own fields and so needs
saying so out loud:

```sh
pnpm seed --import --dry-run
pnpm seed --import
```

See `scripts/README.md` for the columns and what the flag is protecting.

Two things to keep in step by hand, because nothing enforces it — the rules
cannot read the config file, and the config file cannot read the rules:

- `wedding.rsvp.deadline` in `src/lib/lib/wedding.ts` and the `isBeforeCutoff()`
  timestamp in the deployed ruleset must be the same date.
- `RESPONSE_FIELDS` in `src/lib/rsvp/types.ts` and `onlyResponseFieldsChanged()`
  in the deployed ruleset must list the same keys.

`customMessage` is deliberately **not** in `RESPONSE_FIELDS`: it is the couple's
wording, and a guest must never be able to change what an invitation says.

## Editing the invitation

All copy and content live in `src/lib/lib/wedding.ts` — names, date, venue, story, events, dress code, RSVP details, and registry links. Replace the placeholders there.

- RSVP contact: `wedding.rsvp.contact` and `wedding.rsvp.contactEmail` are what a guest is shown when their code does not work, which will happen. They are still placeholders.
- OG share image: `node artwork/build-og-image.mjs` regenerates `static/images/og.png`.
- Plant illustrations: see `artwork/README.md`.
