import type { Side } from '../rsvp/types';
import type { AdminRow } from './row';

/** Counts and heads for one group of households. */
export interface SideTotals {
	/** Households in scope. */
	households: number;

	/** Seats the couple allotted — the number they printed on the cards. */
	invited: number;

	/** Heads actually confirmed. Summed from `partySize`, not counted from households. */
	confirmed: number;

	/** Households that said no. */
	declined: number;

	/** Seats held by those households. Part of `invited`, never reclaimable by the caterer. */
	declinedSeats: number;

	/** Households that have not answered. */
	pending: number;

	/** Seats still unaccounted for. */
	pendingSeats: number;

	/**
	 * Seats an accepting household reserved and did not fill — the common case
	 * where four are invited and three come.
	 *
	 * This is the number that tells the couple whether they over-printed: seats
	 * freed by an incomplete acceptance, and seats nobody has claimed yet.
	 *
	 * Negative for an over-committed household, where `partySize` exceeds the
	 * allotment. That is the same defect `AdminRow.overcommitted` reports, seen
	 * from the totals side, and it is why the figure is not clamped to zero.
	 */
	unfilledSeats: number;
}

export interface Totals extends SideTotals {
	/**
	 * Households with `active: false`.
	 *
	 * Counted separately and kept out of every other figure. A code for an
	 * archived household may already be printed and sent, but the household is no
	 * longer coming, and folding it into `invited` would inflate the headcount the
	 * couple is planning around.
	 */
	archived: number;

	/** Active households whose `partySize` exceeds `seatsAllocated`. See `AdminRow.overcommitted`. */
	overcommitted: number;

	bySide: Record<Side, SideTotals>;
}

function blank(): SideTotals {
	return {
		households: 0,
		invited: 0,
		confirmed: 0,
		declined: 0,
		declinedSeats: 0,
		pending: 0,
		pendingSeats: 0,
		unfilledSeats: 0
	};
}

function accumulate(totals: SideTotals, row: AdminRow): void {
	totals.households += 1;
	totals.invited += row.seatsAllocated;

	if (row.status === 'attending') {
		totals.confirmed += row.partySize;
		// Seats reserved but not filled. Negative when the household is
		// over-committed, which is the point — see `unfilledSeats`.
		totals.unfilledSeats += row.seatsAllocated - row.partySize;
	} else if (row.status === 'declined') {
		totals.declined += 1;
		totals.declinedSeats += row.seatsAllocated;
	} else {
		totals.pending += 1;
		totals.pendingSeats += row.seatsAllocated;
	}
}

/**
 * The headcount, as a pure function of the rows on screen.
 *
 * Imported by nothing from Firestore, so the arithmetic can be tested without a
 * project, a network, or an emulator — which is why the numbers the couple will
 * actually act on are the numbers that get tested hardest.
 */
export function totals(rows: AdminRow[]): Totals {
	const overall = blank();
	const bySide: Record<Side, SideTotals> = { bride: blank(), groom: blank(), both: blank() };

	let archived = 0;
	let overcommitted = 0;

	for (const row of rows) {
		if (!row.active) {
			archived += 1;
			continue;
		}

		accumulate(overall, row);
		accumulate(bySide[row.side], row);

		if (row.overcommitted) overcommitted += 1;
	}

	return { ...overall, archived, overcommitted, bySide };
}

/**
 * Whether every invited seat has been accounted for.
 *
 * `invited` is exactly the sum of four disjoint buckets, so this holds for any
 * input — including an over-committed household, whose `unfilledSeats` goes
 * negative and cancels out the excess. It is exported rather than inlined so the
 * dashboard can assert it in the UI, where a false result means the arithmetic
 * has been edited wrongly rather than the data being bad.
 *
 * A balanced set of books can still contain an over-commitment, so this is not a
 * substitute for `overcommitted`.
 */
export function booksBalance(totals: Totals): boolean {
	return (
		totals.invited ===
		totals.confirmed + totals.declinedSeats + totals.pendingSeats + totals.unfilledSeats
	);
}

/**
 * Heads the couple still has to chase, and the seats riding on them.
 *
 * Declined seats are excluded deliberately: a household that said no has given
 * its answer, and re-counting them as outstanding would suggest there is still
 * something to be done about it.
 */
export function outstanding(rows: AdminRow[]): { households: number; seats: number } {
	let households = 0;
	let seats = 0;

	for (const row of rows) {
		if (!row.active || row.status !== 'pending') continue;

		households += 1;
		seats += row.seatsAllocated;
	}

	return { households, seats };
}