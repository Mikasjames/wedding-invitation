import type { Totals } from './totals';

/**
 * How the list stands against the number of guests the couple is planning for.
 *
 * `Totals` already answers "how many are coming" and "how many seats have been
 * handed out". Neither answers the question the couple asks before invitations
 * go out: does this list fit the room? That needs a third number, and it is
 * deliberately not stored on any document — it is a planning target, not a fact
 * about a household, and no guest should ever be able to see or change it.
 */
export interface CapacityStanding {
	/** The target, floored to whole guests. */
	target: number;

	/** Heads confirmed so far. */
	confirmed: number;

	/** Seats held by households that have not answered yet. */
	pendingSeats: number;

	/**
	 * The most heads that can still attend: everyone confirmed, plus every
	 * outstanding seat if each household that has not answered fills its whole
	 * party.
	 *
	 * Not `Totals.invited`. That figure also counts seats already released — by
	 * a decline, or by an accepting household that came with fewer people than
	 * it was given — and comparing those against the room would keep raising an
	 * alarm about seats nobody can occupy.
	 */
	fullHouse: number;

	/** Heads still needed to fill the target. Zero once it is met or exceeded. */
	remaining: number;

	/** Heads confirmed beyond the target. */
	confirmedOver: number;

	/** Heads over the target in the worst case, where every pending seat is taken. */
	fullHouseOver: number;
}

/**
 * Compares the totals against a target, or `null` when there is no usable one.
 *
 * A missing, non-finite, or sub-one target means "not planning against a
 * number", and that has to render as nothing rather than as a target of zero
 * and a screen full of alarms. `null` is the honest answer to "no target set".
 *
 * Floored because a seat is a person: a target of 99.5 is a typo, and rounding
 * it up would compare the couple against a capacity nobody can have.
 *
 * Clamped at zero on every over-count, so a household that confirmed more seats
 * than it was given can never make `remaining` negative — that defect already
 * has its own figure in `Totals.overcommitted`.
 */
export function capacityStanding(
	totals: Totals,
	target: number | null
): CapacityStanding | null {
	if (target === null || !Number.isFinite(target) || target < 1) return null;

	const goal = Math.floor(target);
	const fullHouse = totals.confirmed + totals.pendingSeats;

	return {
		target: goal,
		confirmed: totals.confirmed,
		pendingSeats: totals.pendingSeats,
		fullHouse,
		remaining: Math.max(0, goal - totals.confirmed),
		confirmedOver: Math.max(0, totals.confirmed - goal),
		fullHouseOver: Math.max(0, fullHouse - goal)
	};
}
