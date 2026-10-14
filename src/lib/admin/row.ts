import type { RsvpStatus, Side } from '../rsvp/types';

/**
 * The dashboard's view of a household.
 *
 * Deliberately *not* `Rsvp`. `readRsvp` clamps `partySize` to `seatsAllocated`,
 * which is right for a guest — a malformed document should not render a stepper
 * offering seats the household does not have. It is exactly wrong here: the one
 * thing the couple needs to see is the contradiction, and clamping hides it.
 */
export interface AdminRow {
	code: string;
	householdName: string;
	side: Side;
	seatsAllocated: number;

	/** An archived household keeps resolving so a printed code still means something. */
	active: boolean;

	contactEmail: string | null;

	/** Couple-internal, never shown to a guest. */
	notes: string;

	/**
	 * This household's own invitation wording. Empty means the shared template.
	 *
	 * The invitation *to* them — not `message` below, which is the note they leave
	 * *back*. Both are on one screen, so the distinction is stated rather than left
	 * to the column heading.
	 */
	customMessage: string;

	status: RsvpStatus;

	/** As stored, even when it exceeds `seatsAllocated`. See `overcommitted`. */
	partySize: number;

	attendeeNames: string[];
	message: string;

	respondedAt: Date | null;
	createdAt: Date | null;
	updatedAt: Date | null;

	/**
	 * `partySize` exceeds `seatsAllocated`.
	 *
	 * Reachable only because `isWeddingAdmin()` short-circuits `isWellFormed()` in
	 * the rules, which is how an admin can fix an over-allotted household. The
	 * cost is that the household is then *locked out*: their next RSVP update
	 * fails the same `isWellFormed()` check and can never succeed again.
	 *
	 * `HouseholdEditor` exists partly to stop this being created silently. Until
	 * then, the dashboard flags it rather than hiding it.
	 */
	overcommitted: boolean;
}

/**
 * Firestore `Timestamp` → `Date`, tolerating a value that is already one.
 *
 * The `toDate` duck-type rather than `instanceof` because the Firestore classes
 * do not survive a bundler boundary intact, and this module is unit-tested
 * without the SDK loaded at all.
 */
function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

	if (value && typeof value === 'object' && 'toDate' in value) {
		const toDate = (value as { toDate?: unknown }).toDate;

		if (typeof toDate === 'function') {
			const date = (toDate as () => Date).call(value);
			return Number.isNaN(date?.getTime?.()) ? null : date;
		}
	}

	return null;
}

function toInt(value: unknown, fallback = 0): number {
	const parsed = Number(value);

	return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toStr(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Reads a Firestore document into a dashboard row.
 *
 * Unlike `readRsvp` this trusts nothing except its own types but never corrects a
 * value — an unrecognised `status` becomes `'pending'` so the row still renders,
 * but a `partySize` above the allotment is passed through intact.
 */
export function readAdminRow(code: string, data: Record<string, unknown> | undefined): AdminRow | null {
	if (!data) return null;

	const side = data.side === 'bride' || data.side === 'groom' ? data.side : 'both';
	const status =
		data.status === 'attending' || data.status === 'declined' ? data.status : 'pending';

	const seatsAllocated = Math.max(toInt(data.seatsAllocated), 0);
	const partySize = Math.max(toInt(data.partySize), 0);

	return {
		code,
		householdName: toStr(data.householdName),
		side,
		seatsAllocated,
		active: data.active === true,
		contactEmail: typeof data.contactEmail === 'string' && data.contactEmail ? data.contactEmail : null,
		notes: toStr(data.notes),
		customMessage: toStr(data.customMessage),
		status,
		partySize,
		attendeeNames: Array.isArray(data.attendeeNames)
			? data.attendeeNames.filter((name): name is string => typeof name === 'string')
			: [],
		message: toStr(data.message),
		respondedAt: toDate(data.respondedAt),
		createdAt: toDate(data.createdAt),
		updatedAt: toDate(data.updatedAt),
		overcommitted: partySize > seatsAllocated
	};
}
