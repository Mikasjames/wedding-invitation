import type { Timestamp } from 'firebase/firestore';

/**
 * One document per invited household, at `rsvps/{code}`.
 *
 * The split between the two interfaces below is not cosmetic — it is the
 * guest/owner boundary that `firestore.rules` enforces. `SeededFields` is
 * written by the seed script and, later, by an authenticated admin.
 * `ResponseFields` is the complete set of keys a guest may change, and the
 * rules use `diff().affectedKeys().hasOnly(RESPONSE_FIELDS)` to say so. Adding
 * an `/admin` dashboard later means widening that one rule, not moving data.
 */
export interface SeededFields {
	schemaVersion: number;

	/** Shown to the guest as "Welcome, ___". The one seeded string a guest sees. */
	householdName: string;

	/** Which side of the wedding this household belongs to. */
	side: 'bride' | 'groom' | 'both';

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

	dietaryNotes: string;
	message: string;
	respondedAt: Timestamp | null;
}

export type Rsvp = SeededFields & ResponseFields;

export type RsvpStatus = 'pending' | 'attending' | 'declined';

/**
 * The guest-writable field set. Mirrors `onlyResponseFieldsChanged()` in
 * `firestore.rules` — change one and you must change the other, which is why
 * the rules file repeats the list literally rather than importing this.
 */
export const RESPONSE_FIELDS = [
	'status',
	'partySize',
	'attendeeNames',
	'dietaryNotes',
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
		createdAt: data.createdAt as Timestamp,
		updatedAt: data.updatedAt as Timestamp,

		status,
		// A stored party size above the allotment is not trusted; the rules would
		// have refused it, but a document seeded before they existed may hold one.
		partySize: Math.min(Math.max(Number(data.partySize) || 0, 0), seatsAllocated),
		attendeeNames: Array.isArray(data.attendeeNames)
			? data.attendeeNames.filter((n): n is string => typeof n === 'string')
			: [],
		dietaryNotes: typeof data.dietaryNotes === 'string' ? data.dietaryNotes : '',
		message: typeof data.message === 'string' ? data.message : '',
		respondedAt: (data.respondedAt as Timestamp | null) ?? null
	};
}