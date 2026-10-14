import type { Timestamp } from 'firebase/firestore';

/**
 * One document per invited household, at `rsvps/{code}`.
 *
 * The split between the two interfaces below is not cosmetic — it is the
 * guest/owner boundary that the deployed ruleset enforces. `SeededFields` is
 * written by the seed script and, later, by an authenticated admin.
 * `ResponseFields` is the complete set of keys a guest may change, and the
 * rules use `diff().affectedKeys().hasOnly(RESPONSE_FIELDS)` to say so. Adding
 * an `/admin` dashboard later means widening that one rule, not moving data.
 */
/**
 * Which side of the wedding a household belongs to.
 *
 * Declared once here rather than inlined at each use: `SeededFields`, the admin
 * row, the totals breakdown and the CSV all key off the same three values, and a
 * fourth side added in one place and not another would leave the dashboard
 * quietly miscounting.
 */
export type Side = 'bride' | 'groom' | 'both';

export interface SeededFields {
	schemaVersion: number;

	/** Shown to the guest as "Welcome, ___". The one seeded string a guest sees. */
	householdName: string;

	/** Which side of the wedding this household belongs to. */
	side: Side;

	/**
	 * The couple's allotment. A guest may never change it — that is the whole
	 * point of `partySize` being a separate field, and the rules refuse any
	 * write that moves this one.
	 */
	seatsAllocated: number;

	/**
	 * Archived rather than deleted. A code may already be printed on paper and in
	 * sent messages, so the link has to keep resolving after the household is
	 * dropped; it should land on "no longer active", not on a generic failure.
	 */
	active: boolean;

	/** For the couple's own reminder list. Never rendered to a guest. */
	contactEmail: string | null;

	/** Couple-internal. Never rendered to a guest. */
	notes: string;

	/**
	 * This household's own invitation wording, replacing the shared template.
	 *
	 * Empty means the template in `wedding.ts`. Owned by the couple and written
	 * only by them — a guest cannot change what an invitation says, so this is on
	 * the owner side of the split above and must never appear in
	 * `RESPONSE_FIELDS`.
	 *
	 * Note this is the *invitation to* the household. `ResponseFields.message` is
	 * the note a household leaves *back*, and the two are unrelated despite the
	 * similar name.
	 */
	customMessage: string;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface ResponseFields {
	status: RsvpStatus;

	/**
	 * Confirmed heads. Zero unless `attending`, and never above
	 * `seatsAllocated` — an invariant the rules enforce, not just the UI.
	 */
	partySize: number;

	/** Optional, so the couple can seat by name rather than by household. */
	attendeeNames: string[];

	message: string;
	respondedAt: Timestamp | null;
}

export type Rsvp = SeededFields & ResponseFields;

export type RsvpStatus = 'pending' | 'attending' | 'declined';

/**
 * The guest-writable field set. Mirrors `onlyResponseFieldsChanged()` in the
 * deployed ruleset — change one and you must change the other. The rules
 * cannot import this, so the list is written out literally on the console side,
 * and nothing in git compares the two.
 */
export const RESPONSE_FIELDS = [
	'status',
	'partySize',
	'attendeeNames',
	'message',
	'respondedAt'
] as const;

export const RSVP_STATUSES: readonly RsvpStatus[] = ['pending', 'attending', 'declined'];

/** What a guest is being asked, before they answer. */
export type Intent = 'attending' | 'declined';

/**
 * Reads a Firestore document as an `Rsvp`, or `null` if it is not one.
 *
 * The document came from the open internet, so treat every field as hostile
 * until checked: a guest could have written to their own document before these
 * rules were deployed, or an older seed may predate a field. Clamping the seat
 * count here is what keeps a malformed `seatsAllocated` from rendering a
 * stepper that lets a household claim ten seats.
 */
export function readRsvp(data: Record<string, unknown> | undefined): Rsvp | null {
	if (!data || data.active !== true) return null;

	const seatsAllocated = Number(data.seatsAllocated);

	if (!Number.isInteger(seatsAllocated) || seatsAllocated < 0) return null;

	const status = RSVP_STATUSES.includes(data.status as RsvpStatus)
		? (data.status as RsvpStatus)
		: 'pending';

	return {
		schemaVersion: Number(data.schemaVersion) || 1,
		householdName: String(data.householdName ?? ''),
		side: data.side === 'bride' || data.side === 'groom' ? data.side : 'both',
		seatsAllocated,
		active: true,
		contactEmail: typeof data.contactEmail === 'string' ? data.contactEmail : null,
		notes: typeof data.notes === 'string' ? data.notes : '',
		customMessage: typeof data.customMessage === 'string' ? data.customMessage : '',
		createdAt: data.createdAt as Timestamp,
		updatedAt: data.updatedAt as Timestamp,

		status,
		// A stored party size above the allotment is not trusted; the rules would
		// have refused it, but a document seeded before they existed may hold one.
		partySize: Math.min(Math.max(Number(data.partySize) || 0, 0), seatsAllocated),
		attendeeNames: Array.isArray(data.attendeeNames)
			? data.attendeeNames.filter((n): n is string => typeof n === 'string')
			: [],
		message: typeof data.message === 'string' ? data.message : '',
		respondedAt: (data.respondedAt as Timestamp | null) ?? null
	};
}