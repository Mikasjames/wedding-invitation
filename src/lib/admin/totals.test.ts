import { describe, expect, it } from 'vitest';
import type { AdminRow } from './row';
import { booksBalance, outstanding, totals } from './totals';
import type { RsvpStatus, Side } from '../rsvp/types';

function row(overrides: Partial<AdminRow> & { code?: string } = {}): AdminRow {
	return {
		code: 'W8K9JPTR4M',
		householdName: 'Dela Cruz Family',
		side: 'both',
		seatsAllocated: 2,
		active: true,
		contactEmail: null,
		notes: '',
		status: 'pending',
		partySize: 0,
		attendeeNames: [],
		message: '',
		respondedAt: null,
		createdAt: null,
		updatedAt: null,
		overcommitted: false,
		...overrides
	};
}

/** A household that is not over-committed, so the books can be checked. */
function clean(overrides: Partial<AdminRow> = {}): AdminRow {
	return { ...row(overrides), overcommitted: overrides.partySize! > overrides.seatsAllocated! };
}

describe('totals', () => {
	it('is all zeroes for no rows', () => {
		const t = totals([]);

		expect(t.households).toBe(0);
		expect(t.invited).toBe(0);
		expect(t.confirmed).toBe(0);
		expect(t.archived).toBe(0);
		expect(t.bySide).toEqual({
			bride: expect.objectContaining({ households: 0 }),
			groom: expect.objectContaining({ households: 0 }),
			both: expect.objectContaining({ households: 0 })
		});
	});

	// The number the couple is actually planning the catering around.
	it('sums confirmed heads, not households', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 3 }),
			clean({ status: 'attending', seatsAllocated: 2, partySize: 2 })
		]);

		expect(t.households).toBe(2);
		expect(t.invited).toBe(6);
		expect(t.confirmed).toBe(5);
	});

	it('counts declined and pending households with their seats', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 4 }),
			clean({ status: 'declined', seatsAllocated: 3 }),
			clean({ status: 'declined', seatsAllocated: 2 }),
			clean({ status: 'pending', seatsAllocated: 6 })
		]);

		expect(t.declined).toBe(2);
		expect(t.declinedSeats).toBe(5);
		expect(t.pending).toBe(1);
		expect(t.pendingSeats).toBe(6);
	});

	// Every seat the couple printed lands in exactly one of four buckets: claimed
	// by someone coming, released by a decline, still waiting on an answer, or
	// reserved by an accepting household that sent fewer people than it had.
	// This is the identity that proves no head is lost or counted twice.
	it('partitions every invited seat across all four fates', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 3 }),
			clean({ status: 'attending', seatsAllocated: 2, partySize: 2 }),
			clean({ status: 'declined', seatsAllocated: 3 }),
			clean({ status: 'pending', seatsAllocated: 6 }),
			clean({ status: 'pending', seatsAllocated: 1 })
		]);

		expect(t.invited).toBe(16);
		expect(t).toMatchObject({ confirmed: 5, declinedSeats: 3, pendingSeats: 7, unfilledSeats: 1 });
		expect(t.confirmed + t.declinedSeats + t.pendingSeats + t.unfilledSeats).toBe(t.invited);
		expect(booksBalance(t)).toBe(true);
	});

	// The common case: four seats reserved, three people coming. Those four seats
	// are not declined and not pending, so without `unfilledSeats` the totals
	// simply lose one and the catering order comes up a head short.
	it('counts seats an accepting household did not fill', () => {
		const t = totals([clean({ status: 'attending', seatsAllocated: 4, partySize: 3 })]);

		expect(t.unfilledSeats).toBe(1);
		expect(t.invited).toBe(4);
		expect(t.confirmed).toBe(3);
		expect(booksBalance(t)).toBe(true);
	});

	it('reports no unfilled seats when a household fills its allotment', () => {
		expect(totals([clean({ status: 'attending', seatsAllocated: 4, partySize: 4 })]).unfilledSeats).toBe(
			0
		);
	});

	// A code for an archived household may be on a printed card, but the household
	// is not coming. Counting its seats would inflate the headcount.
	it('keeps archived households out of every headline figure', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 4 }),
			clean({ active: false, seatsAllocated: 10, status: 'attending', partySize: 10 }),
			clean({ active: false, seatsAllocated: 3, status: 'pending' })
		]);

		expect(t.archived).toBe(2);
		expect(t.households).toBe(1);
		expect(t.invited).toBe(4);
		expect(t.confirmed).toBe(4);
		expect(t.bySide.bride.households + t.bySide.groom.households + t.bySide.both.households).toBe(
			t.households
		);
	});

	it('splits by side', () => {
		const t = totals([
			clean({ side: 'bride', status: 'attending', seatsAllocated: 4, partySize: 2 }),
			clean({ side: 'bride', status: 'declined', seatsAllocated: 2 }),
			clean({ side: 'groom', status: 'pending', seatsAllocated: 5 }),
			clean({ side: 'both', status: 'attending', seatsAllocated: 1, partySize: 1 })
		]);

		expect(t.bySide.bride).toMatchObject({
			households: 2,
			invited: 6,
			confirmed: 2,
			declined: 1,
			declinedSeats: 2
		});
		expect(t.bySide.groom).toMatchObject({ households: 1, invited: 5, pending: 1 });
		expect(t.bySide.both).toMatchObject({ households: 1, confirmed: 1 });
	});

	// An over-allotted household confirms more heads than it was given seats. The
	// partition still holds — `unfilledSeats` goes negative and cancels the excess
	// — which is precisely why it must not be clamped to zero.
	it('reports an over-committed household rather than hiding it', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 4 }),
			clean({ status: 'attending', seatsAllocated: 2, partySize: 3, overcommitted: true })
		]);

		expect(t.overcommitted).toBe(1);
		expect(t.confirmed).toBe(7);
		expect(t.invited).toBe(6);
		expect(t.unfilledSeats).toBe(-1);
		expect(booksBalance(t)).toBe(true);
	});

	// A negative figure is the loudest signal the dashboard has. Clamping it to
	// zero would hide the defect that produced it.
	it('does not clamp a negative unfilled figure', () => {
		const t = totals([clean({ status: 'attending', seatsAllocated: 1, partySize: 5, overcommitted: true })]);

		expect(t.unfilledSeats).toBe(-4);
	});

	it('does not count an archived over-commitment', () => {
		const t = totals([
			clean({ active: false, seatsAllocated: 1, partySize: 9, overcommitted: true })
		]);

		expect(t.overcommitted).toBe(0);
		expect(t.archived).toBe(1);
	});

	it('reports balance for a clean guest list', () => {
		expect(
			booksBalance(
				totals([
					clean({ status: 'attending', seatsAllocated: 2, partySize: 2 }),
					clean({ status: 'pending', seatsAllocated: 3 })
				])
			)
		).toBe(true);
	});

	// Guards against a fourth bucket being introduced without the identity being
	// revisited. Fails here rather than showing the couple a total a seat short.
	it('fails to balance if a bucket stops being counted', () => {
		const t = totals([
			clean({ status: 'attending', seatsAllocated: 4, partySize: 3 }),
			clean({ status: 'declined', seatsAllocated: 2 })
		]);

		t.pendingSeats = 99;

		expect(booksBalance(t)).toBe(false);
	});
});

describe('outstanding', () => {
	it('counts only unanswered active households', () => {
		const result = outstanding([
			clean({ status: 'pending', seatsAllocated: 4 }),
			clean({ status: 'pending', seatsAllocated: 2 }),
			clean({ status: 'attending', seatsAllocated: 3, partySize: 3 }),
			clean({ status: 'declined', seatsAllocated: 5 }),
			clean({ active: false, status: 'pending', seatsAllocated: 9 })
		]);

		expect(result).toEqual({ households: 2, seats: 6 });
	});

	// A household that declined has given its answer. Re-counting their seats as
	// outstanding would imply there is still something to chase.
	it('does not treat a declined household as outstanding', () => {
		const result = outstanding([
			clean({ status: 'declined', seatsAllocated: 8 }),
			clean({ status: 'pending', seatsAllocated: 1 })
		]);

		expect(result.households).toBe(1);
		expect(result.seats).toBe(1);
	});
});

describe('status coverage', () => {
	// Guards the accumulation against a fourth status being added to the union
	// without this switch being revisited.
	it('handles every status without losing seats', () => {
		const statuses: RsvpStatus[] = ['pending', 'attending', 'declined'];

		const rows = statuses.map((status, i) =>
			clean({ code: `CODE${i}0000`, status, seatsAllocated: 2, partySize: status === 'attending' ? 2 : 0 })
		);

		const t = totals(rows);

		expect(t.households).toBe(statuses.length);
		expect(t.invited).toBe(6);
		expect(booksBalance(t)).toBe(true);
	});
});

describe('side coverage', () => {
	it('handles every side without losing households', () => {
		const sides: Side[] = ['bride', 'groom', 'both'];

		const t = totals(sides.map((side, i) => clean({ code: `SIDE${i}00000`, side })));

		const sum = sides.reduce((total, side) => total + t.bySide[side].households, 0);

		expect(sum).toBe(t.households);
	});
});