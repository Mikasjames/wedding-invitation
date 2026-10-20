import { describe, expect, it } from 'vitest';
import type { AdminRow } from './row';
import { capacityStanding } from './capacity';
import { totals } from './totals';

function row(overrides: Partial<AdminRow> = {}): AdminRow {
	return {
		code: 'W8K9JPTR4M',
		householdName: 'Dela Cruz Family',
		side: 'both',
		seatsAllocated: 2,
		active: true,
		contactEmail: null,
		notes: '',
		customMessage: '',
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

describe('capacityStanding', () => {
	// "Not planning against a number" is a real state — the count is still
	// tentative — and it must not render as a target of zero.
	it('is null when no target is set', () => {
		expect(capacityStanding(totals([]), null)).toBeNull();
	});

	it.each([0, -5, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'is null for the unusable target %s',
		(target) => {
			expect(capacityStanding(totals([]), target)).toBeNull();
		}
	);

	it('floors a fractional target to whole guests', () => {
		const standing = capacityStanding(totals([]), 99.9);

		expect(standing?.target).toBe(99);
	});

	it('reports the figures it was given', () => {
		const t = totals([
			row({ status: 'attending', seatsAllocated: 4, partySize: 3 }),
			row({ status: 'pending', seatsAllocated: 5 })
		]);
		const standing = capacityStanding(t, 100);

		expect(standing?.confirmed).toBe(3);
		expect(standing?.pendingSeats).toBe(5);
	});

	it('counts down the heads still needed', () => {
		const t = totals([row({ status: 'attending', seatsAllocated: 4, partySize: 3 })]);

		expect(capacityStanding(t, 100)?.remaining).toBe(97);
	});

	it('stops at zero remaining once the target is met', () => {
		const t = totals([row({ status: 'attending', seatsAllocated: 4, partySize: 4 })]);

		expect(capacityStanding(t, 4)).toEqual(
			expect.objectContaining({ remaining: 0, confirmedOver: 0 })
		);
	});

	it('reports heads over the target without going negative on remaining', () => {
		const t = totals([row({ status: 'attending', seatsAllocated: 6, partySize: 6 })]);
		const standing = capacityStanding(t, 4);

		expect(standing?.confirmedOver).toBe(2);
		expect(standing?.remaining).toBe(0);
	});

	// The pre-send case: nobody has replied, so the whole list is still pending.
	// Families of four and five add up past the room long before anyone answers.
	it('raises the full house before anybody has replied', () => {
		const t = totals([
			row({ seatsAllocated: 4 }),
			row({ seatsAllocated: 4 }),
			row({ seatsAllocated: 4 })
		]);
		const standing = capacityStanding(t, 10);

		expect(standing?.fullHouse).toBe(12);
		expect(standing?.fullHouseOver).toBe(2);
	});

	// A decline releases its seats, so the full house has to shrink with it.
	// Comparing `invited` instead would keep warning about a party that is not
	// coming.
	it('drops declined seats out of the full house', () => {
		const t = totals([
			row({ status: 'attending', seatsAllocated: 4, partySize: 3 }),
			row({ status: 'declined', seatsAllocated: 6 }),
			row({ status: 'pending', seatsAllocated: 2 })
		]);
		const standing = capacityStanding(t, 100);

		expect(standing?.fullHouse).toBe(5);
		expect(standing?.fullHouseOver).toBe(0);
	});

	// Seats an accepting household did not fill are released too.
	it('drops unfilled seats out of the full house', () => {
		const t = totals([row({ status: 'attending', seatsAllocated: 5, partySize: 2 })]);

		expect(capacityStanding(t, 100)?.fullHouse).toBe(2);
	});

	it('does not report an over-allocation when the full house fits', () => {
		const t = totals([row({ seatsAllocated: 2 })]);

		expect(capacityStanding(t, 100)?.fullHouseOver).toBe(0);
	});

	// Archived households are kept out of every other figure, so they must not
	// inflate the seats held against the room either.
	it('ignores archived households', () => {
		const t = totals([
			row({ seatsAllocated: 2 }),
			row({ seatsAllocated: 50, active: false })
		]);

		expect(capacityStanding(t, 100)?.fullHouse).toBe(2);
	});

	// A household that confirmed more than it was allotted is already its own
	// alarm; it must not also push `remaining` below zero.
	it('never returns a negative figure', () => {
		const t = totals([
			row({ status: 'attending', seatsAllocated: 2, partySize: 5, overcommitted: true })
		]);
		const standing = capacityStanding(t, 3);

		expect(standing?.remaining).toBeGreaterThanOrEqual(0);
		expect(standing?.confirmedOver).toBeGreaterThanOrEqual(0);
		expect(standing?.fullHouseOver).toBeGreaterThanOrEqual(0);
	});
});
