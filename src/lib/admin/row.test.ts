import { describe, expect, it } from 'vitest';
import { readAdminRow, sortRows } from './row';

/** Stands in for a Firestore `Timestamp`, which has `toDate()` but no class identity. */
function timestamp(date: Date) {
	return { toDate: () => date };
}

const VALID = {
	schemaVersion: 1,
	householdName: 'Dela Cruz Family',
	side: 'bride',
	seatsAllocated: 4,
	active: true,
	contactEmail: 'jc@example.com',
	notes: 'Corner table',
	status: 'attending',
	partySize: 3,
	attendeeNames: ['Juan', 'Maria'],
	dietaryNotes: 'No shellfish',
	message: 'Congratulations',
	respondedAt: timestamp(new Date('2026-12-20T09:30:00Z')),
	createdAt: timestamp(new Date('2026-10-01T00:00:00Z')),
	updatedAt: timestamp(new Date('2026-12-20T09:30:00Z'))
};

describe('readAdminRow', () => {
	it('reads a complete document', () => {
		const row = readAdminRow('W8K9JPTR4M', VALID)!;

		expect(row.code).toBe('W8K9JPTR4M');
		expect(row.householdName).toBe('Dela Cruz Family');
		expect(row.side).toBe('bride');
		expect(row.seatsAllocated).toBe(4);
		expect(row.status).toBe('attending');
		expect(row.partySize).toBe(3);
		expect(row.attendeeNames).toEqual(['Juan', 'Maria']);
		expect(row.overcommitted).toBe(false);
	});

	it('converts timestamps to Dates', () => {
		const row = readAdminRow('W8K9JPTR4M', VALID)!;

		expect(row.respondedAt).toBeInstanceOf(Date);
		expect(row.respondedAt?.toISOString()).toBe('2026-12-20T09:30:00.000Z');
	});

	it('accepts a value that is already a Date', () => {
		const date = new Date('2026-12-20T09:30:00Z');
		const row = readAdminRow('W8K9JPTR4M', { ...VALID, respondedAt: date })!;

		expect(row.respondedAt).toBe(date);
	});

	it('returns null for a missing document', () => {
		expect(readAdminRow('W8K9JPTR4M', undefined)).toBeNull();
	});

	// A document seeded before a field existed still has to render a row. The
	// alternative is a dashboard that throws on one bad household.
	it('fills in a sparse document rather than failing', () => {
		const row = readAdminRow('W8K9JPTR4M', { householdName: 'Reyes' })!;

		expect(row.householdName).toBe('Reyes');
		expect(row.side).toBe('both');
		expect(row.seatsAllocated).toBe(0);
		expect(row.status).toBe('pending');
		expect(row.partySize).toBe(0);
		expect(row.attendeeNames).toEqual([]);
		expect(row.contactEmail).toBeNull();
		expect(row.respondedAt).toBeNull();
		expect(row.active).toBe(false);
	});

	it('treats an unrecognised status as pending', () => {
		expect(readAdminRow('W8K9JPTR4M', { ...VALID, status: 'maybe' })!.status).toBe('pending');
	});

	it('treats an unrecognised side as both', () => {
		expect(readAdminRow('W8K9JPTR4M', { ...VALID, side: 'aunt' })!.side).toBe('both');
	});

	it('discards a non-string attendee name', () => {
		const row = readAdminRow('W8K9JPTR4M', { ...VALID, attendeeNames: ['Juan', 7, null] })!;

		expect(row.attendeeNames).toEqual(['Juan']);
	});

	it('treats a blank email as absent', () => {
		expect(readAdminRow('W8K9JPTR4M', { ...VALID, contactEmail: '' })!.contactEmail).toBeNull();
	});

	// The whole reason this reader exists. `readRsvp` clamps partySize to the
	// allotment; doing that here would hide the exact thing the couple needs to
	// see and fix.
	it('preserves a party size above the allotment', () => {
		const row = readAdminRow('W8K9JPTR4M', {
			...VALID,
			seatsAllocated: 2,
			partySize: 3
		})!;

		expect(row.partySize).toBe(3);
		expect(row.seatsAllocated).toBe(2);
		expect(row.overcommitted).toBe(true);
	});

	it('does not flag a party size equal to the allotment', () => {
		const row = readAdminRow('W8K9JPTR4M', { ...VALID, seatsAllocated: 3, partySize: 3 })!;

		expect(row.overcommitted).toBe(false);
	});

	// Mirrors readRsvp, which a guest is shown. Two readers disagreeing about the
	// same document would mean the dashboard and the guest's receipt disagree.
	it('agrees with the guest reader on a well-formed document', () => {
		const row = readAdminRow('W8K9JPTR4M', VALID)!;

		expect(row.seatsAllocated).toBe(4);
		expect(row.partySize).toBe(3);
		expect(row.householdName).toBe('Dela Cruz Family');
		expect(row.status).toBe('attending');
	});
});

describe('sortRows', () => {
	it('puts active households before archived ones', () => {
		const rows = [
			readAdminRow('AAAA00000000', { householdName: 'Archived', active: false })!,
			readAdminRow('BBBB00000000', { householdName: 'Active', active: true })!
		];

		expect(sortRows(rows).map((row) => row.householdName)).toEqual(['Active', 'Archived']);
	});

	it('sorts by name within each group', () => {
		const rows = [
			readAdminRow('CCCC00000000', { householdName: 'Santos' })!,
			readAdminRow('DDDD00000000', { householdName: 'Aguinaldo' })!,
			readAdminRow('EEEE00000000', { householdName: 'Reyes' })!
		];

		expect(sortRows(rows).map((row) => row.householdName)).toEqual([
			'Aguinaldo',
			'Reyes',
			'Santos'
		]);
	});

	it('does not mutate its input', () => {
		const rows = [
			readAdminRow('BBBB00000000', { householdName: 'Bravo' })!,
			readAdminRow('AAAA00000000', { householdName: 'Alpha' })!
		];
		const before = rows.map((row) => row.code);

		sortRows(rows);

		expect(rows.map((row) => row.code)).toEqual(before);
	});
});