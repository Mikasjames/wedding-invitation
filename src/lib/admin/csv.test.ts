import { describe, expect, it } from 'vitest';
import { activeRows, csvFileName, fromCsv, toCsv } from './csv';
import { readAdminRow, type AdminRow } from './row';

function row(overrides: Partial<AdminRow> = {}): AdminRow {
	return readAdminRow('W8K9JPTR4M', {
		householdName: 'Dela Cruz Family',
		side: 'bride',
		seatsAllocated: 4,
		active: true,
		status: 'attending',
		partySize: 3,
		...overrides
	})!;
}

describe('toCsv', () => {
	it('writes a header and one line per household', () => {
		const csv = toCsv([row(), row({ code: 'TR4M2X7K9P', householdName: 'Santos' })]);

		expect(csv.trimEnd().split('\n')).toHaveLength(3);
		expect(csv.split('\n')[0]).toContain('household');
		expect(csv).toContain('seats');
		expect(csv).toContain('confirmed');
	});

	it('quotes every cell unconditionally', () => {
		expect(toCsv([row()]).split('\n')[0].startsWith('"code"')).toBe(true);
	});

	it('leads with what a caterer reads', () => {
		const header = toCsv([row()]).split('\n')[0].slice(1, -1).split('","');

		expect(header.slice(0, 7)).toEqual([
			'code',
			'household',
			'side',
			'active',
			'seats',
			'status',
			'confirmed'
		]);
	});

	it('joins attendee names with semicolons so commas stay inside one cell', () => {
		const csv = toCsv([row({ attendeeNames: ['Juan', 'Maria Cristina', 'Ana'] })]);

		expect(fromCsv(csv)[0].names).toBe('Juan; Maria Cristina; Ana');
	});

	it('renders an archived household as active=no rather than dropping it', () => {
		const parsed = fromCsv(toCsv([row({ active: false })]));

		expect(parsed).toHaveLength(1);
		expect(parsed[0].active).toBe('no');
	});

	it('writes timestamps as ISO so a spreadsheet reads them as dates', () => {
		const respondedAt = new Date('2026-12-20T09:30:00.000Z');
		const parsed = fromCsv(toCsv([row({ respondedAt })]));

		expect(parsed[0].responded).toBe('2026-12-20T09:30:00.000Z');
	});

	it('writes an unanswered household with an empty timestamp', () => {
		const parsed = fromCsv(toCsv([row({ status: 'pending', partySize: 0, respondedAt: null })]));

		expect(parsed[0].responded).toBe('');
	});
});

// The whole reason `cell` quotes unconditionally: a note to the couple carrying a
// comma is not an edge case, it is Tuesday, and a caterer reading a shifted
// column is worse than an untidy file.
describe('CSV round trip', () => {
	const awkward: AdminRow[] = [
		row({
			householdName: 'Santos, Mark & Date',
			message: 'Congratulations! We would not miss it.\nSee you there, Maria.',
			notes: 'Asked about "plus ones" — said no',
			contactEmail: 'ms@example.com'
		}),
		row({ code: 'TR4M2X7K9P', householdName: '', contactEmail: null, notes: '' }),
		row({ code: 'ABCDEFGHJ1', householdName: 'Quo"ted', attendeeNames: ['a"b', 'c,d'] })
	];

	it('survives commas, newlines and quotes in every text field', () => {
		const parsed = fromCsv(toCsv(awkward));

		expect(parsed).toHaveLength(3);
		expect(parsed[0].household).toBe('Santos, Mark & Date');
		expect(parsed[0].message).toBe('Congratulations! We would not miss it.\nSee you there, Maria.');
		expect(parsed[0].notes).toBe('Asked about "plus ones" — said no');
		expect(parsed[2].household).toBe('Quo"ted');
		expect(parsed[2].names).toBe('a"b; c,d');
	});

	it('keeps the column count stable across ragged rows', () => {
		const parsed = fromCsv(toCsv(awkward));
		const header = toCsv(awkward).split('\n')[0].split(',').length;

		for (const record of parsed) {
			expect(Object.keys(record)).toHaveLength(header);
		}
	});

	it('writes empty cells as empty strings, not as undefined', () => {
		const parsed = fromCsv(toCsv(awkward));

		expect(parsed[1].email).toBe('');
		expect(parsed[1].notes).toBe('');
	});

	it('emits a trailing newline so the file concatenates cleanly', () => {
		expect(toCsv([row()]).endsWith('\n')).toBe(true);
	});

	it('is idempotent through a second export', () => {
		const once = toCsv(awkward);
		const rebuilt = fromCsv(once);

		expect(rebuilt).toHaveLength(awkward.length);
		expect(fromCsv(once)[0].household).toBe(fromCsv(toCsv(awkward))[0].household);
	});
});

describe('fromCsv', () => {
	it('reads a header with no rows as no records', () => {
		expect(fromCsv('"a","b"\n')).toEqual([]);
	});

	it('reads nothing as nothing', () => {
		expect(fromCsv('')).toEqual([]);
	});
});

describe('csvFileName', () => {
	it('sorts chronologically in a directory listing', () => {
		expect(csvFileName(new Date('2027-01-15T23:59:59Z'))).toBe('rsvps-2027-01-15.csv');
	});
});

describe('activeRows', () => {
	// A caterer headcount must not depend on whichever filter was left on screen.
	it('drops archived households', () => {
		const rows = [row(), row({ code: 'TR4M2X7K9P', active: false })];

		expect(activeRows(rows)).toHaveLength(1);
		expect(activeRows(rows)[0].active).toBe(true);
	});
});
describe('the invitation column', () => {
	it('carries the couple\'s wording, not the guest\'s note back', () => {
		const cells = fromCsv(toCsv([row({ customMessage: 'Hi there.', message: 'Congratulations!' })]))[0];

		expect(cells.invitation).toBe('Hi there.');
		expect(cells.message).toBe('Congratulations!');
	});

	// The export is shaped so `pnpm seed` could read it back. This is the column
	// that makes the round trip lossy otherwise.
	it('survives the round trip a re-seed would do', () => {
		const cells = fromCsv(toCsv([row({ customMessage: 'Do come, {household}.' })]))[0];

		expect(cells.invitation).toBe('Do come, {household}.');
	});
});
