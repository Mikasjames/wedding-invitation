# Seeding the guest list

`scripts/seed-rsvps.mjs` reads a CSV of households, assigns each one an invite
code, and writes both the Firestore documents and a sheet of ready-to-send
messages.

## 1. The spreadsheet

Copy `data/guests.example.csv` to `data/guests.csv` and fill it in. Only two
columns are required:

| Column | Required | Notes |
|---|---|---|
| `household` | yes | Shown to the guest as "Welcome, ___". The only seeded text a guest sees. |
| `seats` | yes | Whole number, at least 1. This is what the guest is told they have reserved. |
| `side` | no | `bride`, `groom`, or `both`. For the couple's own per-side tallies. |
| `code` | no | Leave blank and one is generated. Supplying one yourself means it has to be exactly 10 characters of `0-9A-Z` minus `I L O U`. |
| `email` | no | For the couple's reminder list. Never shown to a guest. |
| `notes` | no | Couple-internal. Never shown to a guest. |

There is deliberately no "search names" column. Guests look themselves up by
code, so there is no search to make robust against `Ma. Cristina` versus
`Maria Cristina`, and the typo problem disappears rather than being solved.

## 2. Credentials

Pick one:

```sh
# A downloaded service-account key
export FIREBASE_SERVICE_ACCOUNT=/abs/path/wedding-rsvp.json

# or the standard variable, which gcloud sets
export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/wedding-rsvp.json

# or
gcloud auth application-default login
```

Keep the key out of the repo — `.gitignore` covers the usual names, and
`data/` and `out/` are ignored entirely.

## 3. Deploy the rules first

```sh
firebase deploy --only firestore:rules
```

Seeding into a database whose rules are the permissive Firestore-console default
means every guest document is world-readable until the real rules land. Deploy
the rules before the first seed, not after.

## 4. Run it

```sh
pnpm seed --dry-run   # validates the CSV, writes nothing
pnpm seed
```

The dry run is not optional in spirit: it reports every validation problem at
once. The script refuses to write anything if a single row is bad, because a
half-seeded guest list is worse than an unseeded one — some households would have
working codes and others would not, and nothing in the data would say which.

Output goes to `out/links.csv`, with the code, the household, the link, and a
message ready to paste into Messenger.

## Re-running it

Safe, and intended — add a row, run it again. Existing answers are never
touched: the script writes only the couple's own fields on a re-run, and
`createdAt`/`updatedAt` are handled separately.

It will warn when a code is already seeded to a *different* household name, since
that means changing who a link that may already have been sent belongs to.