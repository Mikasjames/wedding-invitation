#!/usr/bin/env node
/**
 * Seeds the guest list into Firestore and writes the invitation messages.
 *
 *   pnpm seed --dry-run   # validate and preview; no credentials needed
 *   pnpm seed             # write to Firestore
 *
 * Credentials, in order of preference:
 *   1. FIREBASE_SERVICE_ACCOUNT=/abs/path/service-account.json
 *   2. GOOGLE_APPLICATION_CREDENTIALS (the standard variable gcloud sets)
 *   3. application default credentials (`gcloud auth application-default login`)
 *
 * Reads `data/guests.csv`, writes `out/links.csv`. Both are gitignored: the first
 * is a list of real people, and the second carries their invite codes.
 *
 * CSV parsing and row validation live in `src/lib/rsvp/guests.ts`, where the
 * unit tests are.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { parseCsv, summarise, validateGuests } from '../src/lib/rsvp/guests.ts';
import { wedding } from '../src/lib/lib/wedding.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'data/guests.csv');
const OUTPUT = resolve(ROOT, 'out/links.csv');
const CNAME = resolve(ROOT, 'static/CNAME');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Where the couple sends links.
 *
 * Read from `static/CNAME` rather than written out here. A hardcoded copy is the
 * same drift that made the deadline a second source of truth: change the domain in
 * one place and the messages go out pointing at the old one, to real people,
 * after the fact. There is one domain file and this reads it.
 */
async function siteUrl() {
	let domain;

	try {
		domain = (await readFile(CNAME, 'utf8')).trim();
	} catch {
		throw new Error(
			`Could not read ${CNAME}. It names the domain the invitation is served from, ` +
				'and the messages cannot be written without it.'
		);
	}

	if (!domain) throw new Error(`${CNAME} is empty. It should contain the custom domain.`);

	return `https://${domain}`;
}

/**
 * Deadline shown in the message, and the couple's names.
 *
 * Both taken from `src/lib/lib/wedding.ts` rather than repeated. The rules file
 * already taught this lesson once — the cutoff exists in two places and nothing
 * keeps them in step — and the message is what actually reaches a guest, so a
 * second copy of the deadline here would be the same bug with a worse blast
 * radius.
 */
const SITE = await siteUrl();
const DEADLINE = wedding.rsvp.deadline;

/**
 * Which Firestore database to seed.
 *
 * Resolved from `process.env` rather than imported from `src/lib/firebase/app.ts`,
 * because that module reads `import.meta.env` and imports `$app/environment`,
 * neither of which Node can load.
 *
 * `--env-file-if-exists=.env` in the `seed` script is what puts the value here.
 * Vite reads `.env` during `dev` and `build`; plain Node does not, so without that
 * flag this resolved to `undefined` and fell through to `(default)` on every run.
 * The comment below says what that costs, and the warning says it out loud, but
 * the flag is the actual fix.
 *
 * The duplication is the point worth watching: this must resolve to the same
 * database the client opens. Seed one and read the other and the dashboard shows
 * all zeros with nothing wrong anywhere in the logs.
 */
const DATABASE_ID = process.env.PUBLIC_FIRESTORE_DATABASE_ID || '(default)';

const message = (household, seats, code) =>
	`Hi ${household}!\n\n` +
	`${wedding.names} are getting married and would be honoured by your presence.\n` +
	`Kindly reply by ${DEADLINE}.\n\n` +
	`Your invitation: ${SITE}/?code=${code}\n` +
	`Your code: ${code} — ${seats} ${seats === 1 ? 'seat' : 'seats'} reserved for you.`;

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

function openDatabase() {
	const key = process.env.FIREBASE_SERVICE_ACCOUNT;

	return getFirestore(
		initializeApp(key ? { credential: cert(JSON.parse(key)) } : { credential: applicationDefault() }),
		DATABASE_ID
	);
}

/** The fields the couple owns. A guest may never write any of these. */
function seededFields(guest) {
	return {
		schemaVersion: 1,
		householdName: guest.householdName,
		side: guest.side,
		seatsAllocated: guest.seatsAllocated,
		// From the spreadsheet, not hardcoded. See `GuestSeed.active` — this runs
		// on every seed, so a literal `true` here silently re-invited anyone
		// archived in the console.
		active: guest.active,
		contactEmail: guest.contactEmail,
		notes: guest.notes
	};
}

/**
 * A household's answer starts here, and only on first sight of the document.
 *
 * On every later run this is left out of the write entirely. Including it would
 * be the worst bug available to this script: re-running it to add one guest
 * would reset every RSVP already collected back to "pending".
 */
function blankResponse() {
	return {
		status: 'pending',
		partySize: 0,
		attendeeNames: [],
		message: '',
		respondedAt: null
	};
}

/**
 * Point reads, one per household.
 *
 * `getAll` is a client-SDK convenience that the Admin SDK does not have, and
 * `collection('rsvps').get()` would work only because the Admin SDK bypasses
 * security rules — which is exactly the guarantee this project depends on when
 * it is not the Admin SDK doing the reading.
 */
async function resolveExisting(db, guests) {
	const refs = guests.map((guest) => db.doc(`rsvps/${guest.code}`));
	const snapshots = await Promise.all(refs.map((ref) => ref.get()));

	return guests.map((guest, i) => ({ guest, ref: refs[i], snapshot: snapshots[i] }));
}

/** A code already pointing at a different household means a link may be stale. */
function warnAboutReuse(existing) {
	let warned = 0;

	for (const { guest, snapshot } of existing) {
		const current = snapshot.data();

		if (!snapshot.exists || current.householdName === guest.householdName) continue;

		warned++;
		console.warn(
			`  ! ${guest.code} is already seeded to "${current.householdName}", not ` +
				`"${guest.householdName}". Overwriting changes who this link belongs to, ` +
				`and it may already have been sent.`
		);
	}

	return warned;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
	let text;

	try {
		text = await readFile(INPUT, 'utf8');
	} catch {
		console.error(`Could not read ${INPUT}.`);
		console.error('Copy data/guests.example.csv to data/guests.csv and fill it in.');
		process.exitCode = 1;
		return;
	}

	const { guests, problems } = validateGuests(parseCsv(text));

	if (problems.length) {
		console.error(`\n${problems.length} problem(s) found — nothing was written:\n`);
		for (const problem of problems) console.error(`  ${problem}`);
		console.error('\nFix the spreadsheet and run it again.');
		process.exitCode = 1;
		return;
	}

	const totals = summarise(guests);

	console.log(`\n${totals.households} households, ${totals.seats} seats total`);
	console.log(
		`  bride ${totals.bySide.bride} · groom ${totals.bySide.groom} · both ${totals.bySide.both}`
	);
	console.log(`  database: ${DATABASE_ID}`);

	// Loud rather than quiet. This project created `base`, not `(default)`, so
	// falling back means writing somewhere the client will never read — and the
	// symptom is an empty dashboard rather than an error.
	if (DATABASE_ID === '(default)') {
		console.warn(
			'\n  ! Falling back to "(default)", which this project does not use.\n' +
				'    The client reads PUBLIC_FIRESTORE_DATABASE_ID. If that is "base" and\n' +
				'    the seed wrote to "(default)", the dashboard will show no guests.\n' +
				'    Check that .env exists and sets it, or export it before running.\n'
		);
	}

	if (DRY_RUN) {
		// The collision check needs credentials. Previewing the spreadsheet should
		// not, so a missing key downgrades the report instead of failing the run.
		try {
			warnAboutReuse(await resolveExisting(openDatabase(), guests));
		} catch {
			console.log('  (no credentials — skipping the "already seeded" check)');
		}

		console.log('\nDry run — nothing written. Firestore would receive:\n');
		for (const guest of guests.slice(0, 10)) {
			console.log(
				`  rsvps/${guest.code}  ${guest.seatsAllocated}  ${guest.householdName}` +
					(guest.active ? '' : '   (archived — no message written)')
			);
		}
		if (guests.length > 10) console.log(`  … and ${guests.length - 10} more`);
		return;
	}

	let db;

	try {
		db = openDatabase();
	} catch (error) {
		console.error(`\nCould not authenticate: ${error.message}`);
		console.error('See scripts/README.md for the three ways to supply credentials.');
		process.exitCode = 1;
		return;
	}

	const existing = await resolveExisting(db, guests);

	if (warnAboutReuse(existing)) {
		console.error('\nA code now belongs to a different household. Not writing — resolve the above first.');
		process.exitCode = 1;
		return;
	}

	const seen = new Map(existing.map((entry) => [entry.guest.code, entry.snapshot]));

	let created = 0;
	let updated = 0;

	// Batched, because a guest list is small but a couple's first nervous run
	// should not hit the 500-writes-per-batch ceiling.
	for (let i = 0; i < guests.length; i += 400) {
		const batch = db.batch();

		for (const guest of guests.slice(i, i + 400)) {
			const data = seededFields(guest);

			data.updatedAt = FieldValue.serverTimestamp();

			if (seen.get(guest.code)?.exists) {
				updated++;
			} else {
				// Only on first sight of the document. See blankResponse().
				Object.assign(data, blankResponse());
				data.createdAt = FieldValue.serverTimestamp();
				created++;
			}

			// `merge`, not overwrite.
			batch.set(db.doc(`rsvps/${guest.code}`), data, { merge: true });
		}

		await batch.commit();
	}

	console.log(`\n${created} created, ${updated} updated (existing answers left untouched)`);

	// Archived households are still written, so a code that was already sent keeps
	// resolving to something that makes sense. They are not *messaged*, though —
	// this file exists to be pasted into Messenger, and regenerating a fresh
	// invitation for someone who has been dropped is how that happens.
	const invited = guests.filter((guest) => guest.active);
	const archived = guests.length - invited.length;

	if (archived > 0) {
		console.log(
			`  ${archived} archived — left as they are, and not included in the messages`
		);
	}

	await mkdir(dirname(OUTPUT), { recursive: true });

	const rows = [
		['code', 'household', 'seats', 'link', 'message'],
		...invited.map((guest) => [
			guest.code,
			guest.householdName,
			String(guest.seatsAllocated),
			`${SITE}/?code=${guest.code}`,
			message(guest.householdName, guest.seatsAllocated, guest.code)
		])
	];

	await writeFile(
		OUTPUT,
		rows.map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n'),
		'utf8'
	);

	console.log(`\nMessages written to ${OUTPUT}`);
}

await main();