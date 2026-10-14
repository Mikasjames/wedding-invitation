import type { AdminRow } from './row';
import type { Side } from '../rsvp/types.ts';

/**
 * A household the couple is adding from the dashboard.
 *
 * Narrower than a spreadsheet row: there is no line number, and the code is
 * optional because the couple only supply one when a card is already printed with
 * it. Everything else matches what `pnpm seed` would have written, so a household
 * added here is indistinguishable from one added in bulk.
 */
export interface NewHousehold {
	householdName: string;
	side: Side;
	seatsAllocated: number;
	contactEmail: string | null;
	notes: string;

	/**
	 * This household's own invitation wording. Blank means the shared template.
	 *
	 * Optional rather than required, because a household added without one is the
	 * ordinary case — only a few have a reason to be worded differently.
	 */
	customMessage?: string;

	/** Only when a card already carries this code. Generated when absent. */
	code?: string;
}

/** Enough to send the invitation, which is the only reason to create one. */
export interface CreatedHousehold {
	code: string;
	householdName: string;
	seatsAllocated: number;
}

/**
 * What the dashboard needs from storage.
 *
 * `loadAll`, `create`, and `setMessage`. Editing a household generally is still
 * to come, and is a genuinely harder problem than either of those — see
 * `setMessage` for why one field turned out to be tractable.
 */
export interface GuestListBackend {
	/**
	 * Every household in the collection.
	 *
	 * Throws `AdminDeniedError` when the rules refuse, which is the authorisation
	 * answer — see `AdminSession` for why the client does not decide that itself.
	 */
	loadAll(): Promise<AdminRow[]>;

	/**
	 * Creates one household, and resolves with the code it was given.
	 *
	 * Refuses rather than overwrites. `setDoc` on a document id that already exists
	 * silently replaces whatever was there, and a code mistyped onto somebody else's
	 * household would destroy a real answer with nothing in the logs to say so.
	 *
	 * Throws `AdminCodeTakenError` if the code is already in use.
	 */
	create(household: NewHousehold): Promise<CreatedHousehold>;

	/**
	 * Rewrites one household's invitation wording. Empty string means the shared
	 * template.
	 *
	 * Deliberately the *only* editable field, and the reason this is safe at all.
	 *
	 * Editing `seatsAllocated` is the hazard the rest of this file has been written
	 * around: lowering it under a confirmed `partySize` produces a document that
	 * fails `isWellFormed()`, which locks that household out of its own RSVP with
	 * no repair path. Every other owner field is either arithmetic (`seats`) or
	 * structural (`householdName`, `side`, `active`).
	 *
	 * `customMessage` is a string the rules have no opinion about — it is not in
	 * `isWellFormed()`, not in the seat cap, and not in `onlyResponseFieldsChanged()`,
	 * because it is an owner field a guest may never write. So a write that touches
	 * nothing but `customMessage` and `updatedAt` cannot produce a document that
	 * fails any check. The hazard is designed out rather than validated around,
	 * which is also why the method takes one field rather than a patch object.
	 *
	 * The deployed rules agree, and are the backstop rather than the client: the
	 * admin arm of `allow update` is `onlyAdminFieldsChanged()`, a `hasOnly` over
	 * exactly those two keys. So the over-committed document is unreachable from a
	 * browser even by a client other than this one. Do not widen that list without
	 * widening this interface, and do not add `customMessage` to
	 * `onlyResponseFieldsChanged()` — that would let any guest with a valid code
	 * rewrite the invitation addressed to them.
	 *
	 * Throws `AdminWriteRefusedError` when the rules refuse the write — see the
	 * note on that class.
	 */
	setMessage(code: string, customMessage: string): Promise<void>;
}

export class AdminDeniedError extends Error {}
export class AdminDatabaseMissingError extends Error {}
export class AdminOfflineError extends Error {}
export class AdminFailedError extends Error {}

/** The supplied code is already someone's household. Not a generic failure. */
export class AdminCodeTakenError extends Error {}

/**
 * The rules allowed the read but refused the write.
 *
 * Its own class because the generic `AdminDeniedError` message is actively wrong
 * here. That one says the account is not on the admin list — and an account that
 * has just read the whole collection on screen is exactly what reaches this.
 *
 * The admin arm of `allow update` is a `hasOnly` over `customMessage` and
 * `updatedAt`, so "reads fine, writes refused" is a real and reachable state
 * rather than a theoretical one: it is what a `hasOnly(['customMessage'])` that
 * forgot `updatedAt` looks like, and what widening this interface without
 * widening that list would look like. The message names the fix either way.
 */
export class AdminWriteRefusedError extends Error {}

/**
 * Shown when the rules refuse the collection.
 *
 * Deliberately not phrased as "you are not an admin". A rules file that never
 * mentions `rsvps` denies by default and is indistinguishable, from the client's
 * side, from a signed-in account that genuinely is not on the list — and that
 * costs an afternoon to diagnose if the message does not say so.
 */
export const ACCESS_DENIED =
	'This account is not on the admin list for this project. If you expected access, check that the deployed rules include a `match /rsvps/{code}` block granting `list` to admins.';

/**
 * Classifies a Firestore read failure.
 *
 * Each class gets its own message because each has a different fix, and "something
 * went wrong" sends people to the wrong screen.
 */
export function describeGuestError(error: unknown): string {
	if (error instanceof AdminDeniedError) return ACCESS_DENIED;

	// Worth its own line: the couple's likely reaction to a taken code is to try
	// typing it differently, which is the opposite of what would help.
	if (error instanceof AdminCodeTakenError) {
		return 'That code is already in use by another household. Check it, or leave the code blank and we will generate one.';
	}

	// Before the generic permission failure, and worded as what it is: this account
	// can read the guest list — it is on screen — so "not on the admin list" would
	// send the couple looking at the wrong half of the ruleset. It names the two
	// keys to check, because the near-miss is a `hasOnly` that lists one of them.
	if (error instanceof AdminWriteRefusedError) {
		return 'The rules let this account read the guest list but not change it. Check that the admin arm of the deployed `allow update` is gated on onlyAdminFieldsChanged() allowing both customMessage and updatedAt.';
	}

	if (error instanceof AdminDatabaseMissingError) {
		return 'No Firestore database was found for this project. Check PUBLIC_FIREBASE_PROJECT_ID in .env, and that Firestore has been created in michalemuel-wedding.';
	}

	if (error instanceof AdminOfflineError) {
		return 'Could not reach Firestore. Check your connection and try again.';
	}

	return 'The guest list could not be loaded. Please try again.';
}

/**
 * Turns a Firestore error into the one class that describes it.
 *
 * `not-found` and `failed-precondition` both mean "the database is not there" in
 * practice — the first when the project id points at a project with no database,
 * the second when the SDK finds the project but no database in it. Both are the
 * same mistake made from two directions.
 */
export function classifyGuestError(error: unknown): AdminDeniedError | AdminDatabaseMissingError | AdminOfflineError | AdminFailedError {
	const code = (error as { code?: string } | null)?.code ?? '';

	if (code === 'permission-denied') return new AdminDeniedError(code);

	if (code === 'not-found' || code === 'failed-precondition') {
		return new AdminDatabaseMissingError(code);
	}

	if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') {
		return new AdminOfflineError(code);
	}

	return new AdminFailedError(code || 'unknown');
}