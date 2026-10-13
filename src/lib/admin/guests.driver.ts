import type { AdminRow } from './row';

/**
 * What the dashboard needs from storage.
 *
 * Read-only for now. `save` arrives with `HouseholdEditor`; adding it here
 * before anything calls it would mean shipping a method no state machine drives.
 */
export interface GuestListBackend {
	/**
	 * Every household in the collection.
	 *
	 * Throws `AdminDeniedError` when the rules refuse, which is the authorisation
	 * answer — see `AdminSession` for why the client does not decide that itself.
	 */
	loadAll(): Promise<AdminRow[]>;
}

export class AdminDeniedError extends Error {}
export class AdminDatabaseMissingError extends Error {}
export class AdminOfflineError extends Error {}
export class AdminFailedError extends Error {}

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