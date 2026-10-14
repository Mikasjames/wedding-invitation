import type { HouseholdEdit, NewHousehold } from './guests.driver';
import type { Side } from '../rsvp/types';
import { isValidEmail, isValidSeatCount } from '../rsvp/guests';
import { MAX_CUSTOM_MESSAGE } from '../rsvp/message';
import { normalizeCode } from '../rsvp/codes';

/**
 * The fields the form collects, before validation.
 *
 * Extracted from the component so it can be tested. It lived inline in
 * `AddHousehold.svelte` at first, where nothing could reach it — and the first
 * thing nobody noticed was that a `<input type="number">` binds to a *number*, so
 * `.trim()` on it threw on the first real submit.
 */
export interface HouseholdForm {
	householdName: string;

	/**
	 * A number input binds to a number, or `null` when the field is empty. Never a
	 * string, which is the whole reason this is typed rather than `unknown`.
	 */
	seats: number | null;

	side: Side;
	email: string;
	notes: string;
	customMessage: string;
	code: string;
}

export type HouseholdProblems = Partial<
	Record<'householdName' | 'seats' | 'email' | 'code' | 'customMessage', string>
>;

export type ValidatedHousehold =
	| { ok: true; household: NewHousehold }
	| { ok: false; problems: HouseholdProblems };

/**
 * Checks the form and, if it holds together, produces exactly what the backend
 * takes.
 *
 * Validated with the same predicates `pnpm seed` uses, because a household this
 * accepts but the seed would reject is a document shape the rest of the system has
 * never seen.
 */
export function validateHousehold(form: HouseholdForm): ValidatedHousehold {
	const problems: HouseholdProblems = {};

	// Trimmed once here so an all-whitespace message is the same as no message.
	// That matters: the dashboard's editor leaves `''` behind when a couple clears
	// it, and a message of three spaces must not be stored as one.
	const customMessage = form.customMessage.trim();

	if (customMessage.length > MAX_CUSTOM_MESSAGE) {
		problems.customMessage = `That is ${customMessage.length} characters — keep it under ${MAX_CUSTOM_MESSAGE}.`;
	}

	const householdName = form.householdName.trim();
	if (!householdName) problems.householdName = 'Give the household a name.';

	// Covers empty, `null` and anything else non-finite in one test, since all
	// three mean the same thing to the person filling this in.
	const seats = form.seats ?? Number.NaN;

	if (!Number.isFinite(seats)) {
		problems.seats = 'How many seats are reserved for them?';
	} else if (!isValidSeatCount(seats)) {
		problems.seats = 'A household needs at least one seat.';
	}

	const email = form.email.trim();
	if (email && !isValidEmail(email)) problems.email = 'That does not look like an email address.';

	// Run through the same normalisation a guest's typed code goes through, and
	// for the same reason. Uppercasing alone lets `W8K9JPTR4I` through — I is not
	// in the alphabet, so `isKnownCode()` in the deployed rules would refuse it and
	// the household would exist but be permanently unreachable. The form would be
	// manufacturing the exact "my code doesn't work" dead end it exists to avoid.
	const rawCode = form.code.trim();
	const code = rawCode ? normalizeCode(rawCode) : null;

	if (rawCode && !code) {
		problems.code = 'That does not look like a code from an invitation.';
	}

	if (Object.keys(problems).length) return { ok: false, problems };

	return {
		ok: true,
		household: {
			householdName,
			side: form.side,
			seatsAllocated: seats,
			contactEmail: email || null,
			notes: form.notes.trim(),
			customMessage,
			// Omitted rather than set to `''`. The client resolves this with
			// `code ?? generateCode()`, and `'' ?? fallback` is `''` — so an empty
			// string here would be used as the document ID and Firestore would
			// refuse it, instead of a code being generated.
			...(code ? { code } : {})
		}
	};
}

export type HouseholdEditProblems = Partial<
	Record<'householdName' | 'seatsAllocated' | 'contactEmail', string>
>;

export type ValidatedEdit =
	| { ok: true; edit: HouseholdEdit }
	| { ok: false; problems: HouseholdEditProblems };

/**
 * Checks an edit to a household that already exists.
 *
 * Not `validateHousehold` reused: the add form takes a code and a custom invitation,
 * and neither is editable here — a code has to survive being printed on a card, and
 * the wording has its own panel with a preview and its own save.
 *
 * The seat check is the reason this is a function rather than six lines in the
 * component. Lowering `seatsAllocated` below a confirmed `partySize` produces a
 * document that fails `isWellFormed()` in the deployed rules, and that household's
 * next RSVP fails the same check — they cannot lower their own `partySize`, so there
 * is no route back. The rules refuse it too, in `seatCountStaysValid()`; this repeats
 * the refusal so the couple is told the number instead of watching a save fail.
 *
 * Raising seats is never blocked, which is what keeps the repair open: a household
 * already over-committed is fixed by raising their allocation to meet it.
 *
 * `partySize` comes in as a parameter rather than being read off a `GuestList`, so
 * the rule is testable without a backend and the component cannot pass a stale row —
 * the count it checks is the one currently stored.
 */
export interface HouseholdEditForm {
	householdName: string;

	/** A number input binds to a number, or `null` when empty. See `HouseholdForm`. */
	seatsAllocated: number | null;

	side: Side;
	contactEmail: string;
	notes: string;
	active: boolean;
}

export function validateHouseholdEdit(form: HouseholdEditForm, partySize: number): ValidatedEdit {
	const problems: HouseholdEditProblems = {};

	const householdName = form.householdName.trim();
	if (!householdName) problems.householdName = 'Give the household a name.';

	const seats = form.seatsAllocated ?? Number.NaN;

	if (!Number.isFinite(seats)) {
		problems.seatsAllocated = 'How many seats are reserved for them?';
	} else if (!isValidSeatCount(seats)) {
		problems.seatsAllocated = 'A household needs at least one seat.';
	} else if (seats < partySize) {
		// Always plural, and that is not laziness. A confirmed party of one can never
		// conflict: one is the smallest allocation `isValidSeatCount` permits, so
		// there is no valid number below it. The branch this branch would have needed
		// for is unreachable, and `partySize` is an integer by the time it gets here.
		problems.seatsAllocated = `${partySize} seats are already confirmed for this household, so their allocation cannot go below that.`;
	}

	const contactEmail = form.contactEmail.trim();
	if (contactEmail && !isValidEmail(contactEmail)) {
		problems.contactEmail = 'That does not look like an email address.';
	}

	if (Object.keys(problems).length) return { ok: false, problems };

	return {
		ok: true,
		edit: {
			householdName,
			side: form.side,
			seatsAllocated: seats,
			contactEmail: contactEmail || null,
			notes: form.notes.trim(),
			active: form.active
		}
	};
}