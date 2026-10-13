import { describe, expect, it } from 'vitest';
import { CODE_LENGTH } from './codes';
import { isValidCode } from './codes';
import { parseCsv, summarise, validateGuests } from './guests';

const HEADER = 'household,side,seats,code,email,notes';

function check(csv: string) {
	return validateGuests(parseCsv(csv));
}

describe('parseCsv', () => {
	it('reads plain rows', () => {
		expect(parseCsv('a,b\n1,2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	// A spreadsheet export starts with a BOM. Left alone it becomes part of the
	// first header name, so `household` is never found and every row is rejected
	// with a message that gives the couple no idea why.
	it('strips the BOM a spreadsheet export starts with', () => {
		expect(parseCsv('﻿household,seats\nDela Cruz,4')[0]).toEqual(['household', 'seats']);
	});

	it('keeps commas inside quoted fields', () => {
		expect(parseCsv('a,b\n"Santos, Mark & Date",2')[1]).toEqual(['Santos, Mark & Date', '2']);
	});

	it('unescapes doubled quotes', () => {
		expect(parseCsv('a\n"she said ""hi"""')[1]).toEqual(['she said "hi"']);
	});

	it('handles CRLF line endings', () => {
		expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('drops blank rows', () => {
		expect(parseCsv('a,b\n1,2\n\n\n3,4\n')).toHaveLength(3);
	});

	it('copes with a trailing newline', () => {
		expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']]);
	});
});

describe('validateGuests', () => {
	it('accepts the two required columns and nothing else', () => {
		const { guests, problems } = check(`household,seats\nDela Cruz Family,4`);

		expect(problems).toEqual([]);
		expect(guests).toHaveLength(1);
		expect(guests[0]).toMatchObject({
			householdName: 'Dela Cruz Family',
			side: 'both',
			seatsAllocated: 4,
			contactEmail: null,
			notes: ''
		});
	});

	it('generates a usable code when the column is blank', () => {
		const { guests, problems } = check(`${HEADER}\nDela Cruz Family,bride,4`);

		expect(problems).toEqual([]);
		expect(isValidCode(guests[0].code)).toBe(true);
		expect(guests[0].code).toHaveLength(CODE_LENGTH);
	});

	it('keeps a code the couple supplied', () => {
		const { guests, problems } = check(`${HEADER}\nDela Cruz Family,bride,4,W8K9JPTR4M`);

		expect(problems).toEqual([]);
		expect(guests[0].code).toBe('W8K9JPTR4M');
	});

	// Reports every bad row at once. The couple is fixing this in a spreadsheet,
	// not a terminal, and finding one problem per run is miserable.
	it('reports every problem in one pass', () => {
		const { problems } = check(
			[HEADER, 'Dela Cruz Family,bride,four', 'Santos Family,sideways,2', 'Reyes,x,0'].join('\n')
		);

		// Two problems on the last row, one on each of the first two.
		expect(problems).toHaveLength(4);
		expect(problems.join('\n')).toContain('Row 2');
		expect(problems.join('\n')).toContain('Row 3');
		expect(problems.join('\n')).toContain('Row 4');
	});

	// Row 2 is the first data row, so the number has to match what the couple
	// sees in their spreadsheet or the message points at the wrong guest.
	it('numbers problems the way a spreadsheet does', () => {
		const { problems } = check(`${HEADER}\nDela Cruz Family,bride,0`);

		expect(problems[0]).toContain('Row 2');
	});

	it('rejects a zero or negative seat count', () => {
		const { problems } = check(`${HEADER}\nA,bride,0\nB,bride,-2`);

		expect(problems).toHaveLength(2);
		expect(problems.join('\n')).toContain('at least one seat');
	});

	it('rejects a seat count that is not a whole number', () => {
		expect(check(`${HEADER}\nA,bride,2.5`).problems).toHaveLength(1);
		expect(check(`${HEADER}\nA,bride,four`).problems).toHaveLength(1);
		expect(check(`${HEADER}\nA,bride,`).problems[0]).toContain('is empty');
	});

	it('rejects an unknown side', () => {
		expect(check(`${HEADER}\nA,sideways,2`).problems[0]).toContain('bride, groom or both');
	});

	it('rejects a malformed email but allows none at all', () => {
		expect(check(`${HEADER}\nA,bride,2,,not-an-email`).problems).toHaveLength(1);
		expect(check(`${HEADER}\nA,bride,2,,`).problems).toHaveLength(0);
	});

	it('rejects a supplied code that could not have been issued', () => {
		const { problems } = check(`${HEADER}\nA,bride,2,TOOSHORT`);

		expect(problems[0]).toContain('Leave it blank');
	});

	// Two blank rows must not be handed the same code, or one family would
	// overwrite the other's RSVP through a link that was already sent.
	it('never issues the same code twice', () => {
		const { guests, problems } = check(
			`${HEADER}\nA,bride,2\nB,bride,2\nC,bride,2\nD,bride,2\nE,bride,2`
		);

		expect(problems).toEqual([]);
		expect(new Set(guests.map((guest) => guest.code)).size).toBe(guests.length);
	});

	it('catches a duplicate code the couple supplied', () => {
		const { problems } = check(
			`${HEADER}\nA,bride,2,W8K9JPTR4M\nB,bride,2,W8K9JPTR4M`
		);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('already used by "A"');
	});

	it('normalises a supplied code that is merely mistyped', () => {
		const { guests, problems } = check(`${HEADER}\nA,bride,2,w8k9jptr4i`);

		expect(problems).toEqual([]);
		expect(guests[0].code).toBe('W8K9JPTR41');
	});

	it('refuses a file with no usable header', () => {
		expect(check('a,b\n1,2').problems[0]).toContain('must include');
	});

	it('refuses a header with no data rows', () => {
		expect(check(HEADER).problems[0]).toContain('no data rows');
	});

	it('accepts the example sheet', () => {
		const { problems, guests } = check(`${HEADER}
Dela Cruz Family,bride,4,,jc@example.com,
Santos Mark & Date,groom,2,,ms@example.com,"One child seat, not a booster"
"Lim, Maria Cristina",bride,2,,ma@example.com,"Also known as Ma. Cristing"`);

		expect(problems).toEqual([]);
		expect(guests.map((guest) => guest.householdName)).toEqual([
			'Dela Cruz Family',
			'Santos Mark & Date',
			'Lim, Maria Cristina'
		]);
		expect(guests[2].notes).toBe('Also known as Ma. Cristing');
	});
});

describe('summarise', () => {
	it('totals seats and counts sides', () => {
		const { guests } = check(`${HEADER}\nA,bride,4\nB,groom,2\nC,both,6`);

		expect(summarise(guests)).toEqual({
			households: 3,
			seats: 12,
			bySide: { bride: 1, groom: 1, both: 1 }
		});
	});

	// `validateGuests` rejects these and the seed script exits first, so this only
	// matters if someone starts calling `summarise` somewhere else. A "NaN seats"
	// line in front of a couple is still worth guarding against.
	it('skips an unparseable seat count rather than reporting NaN', () => {
		const { guests } = check(`${HEADER}\nA,bride,4\nB,bride,bogus`);

		expect(summarise(guests).seats).toBe(4);
	});
});