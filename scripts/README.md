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
| `invitation` | no | This household's own message, replacing the standard one. See below. |
| `active` | no | `no` archives the household. Blank means still invited. |

`invitation` holds the whole message a household receives, not a greeting or a
sign-off — a partial one would have to guess at the rest. Blank, which is the
ordinary case, means the shared message from `wedding.rsvp.invitation`. Inside it,
these are filled in:

| Token | Becomes |
|---|---|
| `{household}` | The household name. |
| `{names}` | The couple. |
| `{deadline}` | The reply-by date. |
| `{link}` | The invitation link. |
| `{code}` | Their code. |
| `{seats}` | Their seats, with the noun — "4 seats", "1 seat". |

The link is re-attached to the end if the message leaves it out, so no household
can be sent an invitation they cannot open. Everything else is the couple's to
write or leave out. There is a 2,000 character limit, the same one the dashboard
enforces.

The same wording can be written per household from `/admin` instead, which is
easier than editing a spreadsheet and does not need a service-account key — but
that path needs the deployed ruleset to have an admin write branch, which is a
manual step in the console. See step 3.

`active` is the column to reach for when a household has to come off the list
after the messages have gone out. Their code keeps resolving rather than
erroring, because it may already be printed and in someone's inbox — but the
guest can no longer answer, and no new invitation message is written for them.

It lives in the spreadsheet rather than only in the console because the seed
writes it on every run. A household archived by hand would be switched back on
the next `pnpm seed`, and nobody would have decided that.

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

## 3. Set the rules, before the first seed

**The ruleset lives in the Firebase console, not in this repo.** Console →
Firestore → Rules. This is deliberate, and `firestore.rules` was deleted rather
than deprecated.

Seeding into a database whose rules are the permissive Firestore-console default
means every guest document is world-readable until the real rules land. Set the
rules before the first seed, not after.

### Do not deploy rules from here

There is no `firebase.json` and no rules file in this repository, and adding one
back would be a trap. The deployed ruleset contains an **admin branch** — the
`list` grant that lets the dashboard read the collection — and that branch exists
*only in the console*. Nobody has a copy of it outside Firebase.

So any file reconstructed here would be a guest-only ruleset. Deploying it would
replace the live ruleset with something narrower and lock the couple out of their
own guest list, with no obvious error to point at.

If the ruleset ever needs to change, change it in the console and read it back to
check what you are looking at. If it genuinely needs to be version-controlled,
that is a decision to make on purpose, not a side effect of adding a file.

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
message ready to paste into Messenger. The domain, the deadline and the names
in those messages are read from `static/CNAME` and `src/lib/lib/wedding.ts`
rather than written out here, so there is nothing in this script to keep in step
with the site.

## Re-running it

Safe, and intended — add a row, run it again. Existing answers are never
touched: the script writes only the couple's own fields on a re-run, and
`createdAt`/`updatedAt` are handled separately.

It will warn when a code is already seeded to a *different* household name, since
that means changing who a link that may already have been sent belongs to.