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

	/**
	 * This household's own wording, so the receipt shows and copies what was
	 * actually stored rather than the shared template.
	 *
	 * Carried back from `create` rather than read out of the list afterwards: the
	 * receipt is rendered from `lastCreated` alone, and without this it built the
	 * standard message for a household the couple had just written bespoke wording
	 * for — the one message on the page with no other way to recover it.
	 *
	 * Optional because `NewHousehold.customMessage` is, and because a household
	 * added without one is the ordinary case. Empty means the shared template,
	 * which is what `invitationMessage` renders for an empty `custom` anyway.
	 */
	customMessage?: string;
}

/**
 * Every owner field a household has, for a save.
 *
 * A full replacement rather than a partial patch. The editor always has all six
 * loaded, so nothing here is optional, and a required field cannot be cleared by
 * leaving it out — which is the failure a `Partial<>` would invite.
 *
 * The closed shape is the safety property, and it is what replaced the older
 * argument against patch objects. `setMessage` takes one field because one string
 * the rules have no opinion about could be argued about safely; six fields cannot.
 * What has to survive that change is narrower than "one field at a time": it is that
 * a caller cannot express a write the deployed rules would refuse. Here that holds
 * because `status`, `partySize`, `attendeeNames`, `message` and `respondedAt` are not
 * properties of this interface — the whole of `ResponseFields` is absent, so
 * `updateDoc` cannot be handed one, whatever a compromised client does.
 *
 * `partySize` in particular: it is absent, so a save cannot move it, which is what
 * makes the seat guard in the rules (`seatCountStaysValid`) a pure invariant rather
 * than something a caller could satisfy by moving the number it is checking.
 */
export interface HouseholdEdit {
	householdName: string;
	side: Side;
	seatsAllocated: number;
	contactEmail: string | null;
	notes: string;

	/** Archive rather than delete. Reversible, and a printed code keeps resolving. */
	active: boolean;
}

/**
 * What the dashboard needs from storage.
 *
 * `loadAll`, `create`, `update` and `setMessage`.
 *
 * `update` and `setMessage` are kept apart on purpose. The wording is the couple's
 * own prose, edited from the invitation panel with a live preview, and it has its own
 * button and its own error message. Folding it into `update` would mean saving a
 * household six fields to change one of them, which is both a wider write than the
 * rules were widened for and a worse answer when the save fails.
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
	 * Rewrites one household's owner fields.
	 *
	 * The whole of `HouseholdEdit` in one write, which is why the interface is a
	 * closed shape rather than a patch: the deployed admin arm of `allow update` is
	 * `onlyAdminFieldsChanged()`, a `hasOnly` over exactly these six keys plus
	 * `customMessage` and `updatedAt`, so a write naming anything else is refused
	 * whole. Widening one without the other gives a button the rules refuse; widening
	 * this without the other gives a rule that permits something the app never sends.
	 *
	 * The hazard this had to be built around is `seatsAllocated`. Lowering it under a
	 * confirmed `partySize` produces a document that fails `isWellFormed()`, and the
	 * household's next RSVP fails the same check — permanently, since they cannot
	 * lower their own `partySize` and the rules refuse the guest arm for it anyway.
	 *
	 * So the guard is in the deployed rules, not here: `seatCountStaysValid()` on the
	 * admin arm requires `partySize <= seatsAllocated`, which is what makes the
	 * over-committed document unreachable from any browser rather than merely from
	 * this one. `validateHouseholdEdit` repeats it so the couple is told before the
	 * round trip, but the client is the courtesy and the rules are the guard — the
	 * same relationship `setMessage` has with `onlyResponseFieldsChanged()`.
	 *
	 * The guard blocks creating a violation without blocking the repair: an existing
	 * one is `partySize > seatsAllocated`, the only fix is raising `seatsAllocated`,
	 * and raising always satisfies the guard. A household left over-committed by an
	 * earlier ruleset stays fixable from the dashboard.
	 *
	 * Throws `AdminWriteRefusedError` when the rules refuse the write — see the
	 * note on that class.
	 */
	update(code: string, edit: HouseholdEdit): Promise<void>;

	/**
	 * Rewrites one household's invitation wording. Empty string means the shared
	 * template.
	 *
	 * A string the rules have no opinion about — it is not in `isWellFormed()`, not
	 * in the seat cap, and not in `onlyResponseFieldsChanged()`, because it is an
	 * owner field a guest may never write. So a write touching nothing but
	 * `customMessage` and `updatedAt` cannot fail any check.
	 *
	 * Never add `customMessage` to `onlyResponseFieldsChanged()`. That would let any
	 * guest with a valid code rewrite the invitation addressed to them.
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
 * A save would take a household's seats below who has already said they are coming.
 *
 * Its own class, and the only one that is the client's opinion rather than the
 * rules' — the rules refuse the same write as a plain `permission-denied`, so this is
 * the brief window before they see it, where the couple can be told what the number
 * actually is.
 *
 * Named rather than folded into `AdminWriteRefusedError` because the two mean
 * opposite things: that one says "the ruleset is not what this code expects", this
 * one says "the answer here is no, and here is why". Telling a couple their
 * deployed ruleset is wrong when the truth is that they cannot reduce a party of
 * four to two sends them to the wrong half of the console.
 */
export class AdminSeatsBelowConfirmedError extends Error {
	constructor(
		readonly seatsAllocated: number,
		readonly partySize: number
	) {
		super(
			`${partySize} seat${partySize === 1 ? '' : 's'} are already confirmed for this ` +
				`household, so their allocation cannot go below that. Raise it to ${partySize} or more.`
		);
	}
}

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

	// Before the generic failure, and before `AdminWriteRefusedError` for the same
	// reason that one is: the couple can already see this household and how many
	// seats it has confirmed, so the useful thing to say is the number rather than
	// anything about the ruleset. The class's own message carries both counts.
	if (error instanceof AdminSeatsBelowConfirmedError) return error.message;

	// Before the generic permission failure, and worded as what it is: this account
	// can read the guest list — it is on screen — so "not on the admin list" would
	// send the couple looking at the wrong half of the ruleset. It names the keys to
	// check, because the near-miss is a `hasOnly` that lists one of them short.
	if (error instanceof AdminWriteRefusedError) {
		return (
			'The rules let this account read the guest list but not change it. Check that the ' +
			'admin arm of the deployed `allow update` is gated on onlyAdminFieldsChanged() ' +
			'allowing householdName, side, seatsAllocated, contactEmail, notes, active, ' +
			'customMessage and updatedAt.'
		);
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