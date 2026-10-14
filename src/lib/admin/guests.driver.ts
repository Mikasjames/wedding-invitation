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
 * `loadAll` and `create` only. Editing an existing household is still to come,
 * and it is a genuinely harder problem than this one: lowering `seatsAllocated`
 * under a confirmed `partySize` produces a document that fails `isWellFormed()`,
 * which locks that household out of its own RSVP with no repair path. A create
 * has no such hazard, which is why it goes first.
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
}

export class AdminDeniedError extends Error {}
export class AdminDatabaseMissingError extends Error {}
export class AdminOfflineError extends Error {}
export class AdminFailedError extends Error {}

/** The supplied code is already someone's household. Not a generic failure. */
export class AdminCodeTakenError extends Error {}

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