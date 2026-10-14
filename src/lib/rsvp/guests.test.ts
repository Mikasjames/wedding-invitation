import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CODE_LENGTH } from './codes';
import { isValidCode } from './codes';
import {
	blankResponseFields,
	isValidSeatCount,
	newHousehold,
	ownerFields,
	parseCsv,
	SCHEMA_VERSION,
	summarise,
	validateGuests
} from './guests';
import { MAX_CUSTOM_MESSAGE } from './message';
import { RESPONSE_FIELDS } from './types';

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
			notes: '',
			customMessage: ''
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

const ACTIVE_HEADER = 'household,seats,active';

describe('the active column', () => {
	// The reason the column defaults to true: a household should not have to be
	// marked as invited in order to be invited.
	it('treats a blank or absent column as still invited', () => {
		expect(check(`${HEADER}\nA,2`).guests[0].active).toBe(true);
		expect(check(`${ACTIVE_HEADER}\nA,2,`).guests[0].active).toBe(true);
	});

	it('archives on no', () => {
		expect(check(`${ACTIVE_HEADER}\nA,2,no`).guests[0].active).toBe(false);
	});

	// A spreadsheet hands back whatever the couple typed.
	it('accepts the spellings a spreadsheet produces', () => {
		for (const yes of ['yes', 'y', 'true', '1', 'active', 'invited', 'YES']) {
			expect(check(`${ACTIVE_HEADER}\nA,2,${yes}`).guests[0].active).toBe(true);
		}

		for (const no of ['no', 'n', 'false', '0', 'archived', 'inactive', 'No']) {
			expect(check(`${ACTIVE_HEADER}\nA,2,${no}`).guests[0].active).toBe(false);
		}
	});

	// Silently reading an unknown value as "invited" would re-send an invitation to
	// someone who thought they had been taken off the list.
	it('rejects a value it cannot read', () => {
		const { problems } = check(`${ACTIVE_HEADER}\nA,2,maybe`);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('`active` is "maybe"');
	});
});

// `data/guests.example.csv` is the file the couple copies, so it is the first
// thing that ever reaches `validateGuests`. The test above re-types it inline,
// which cannot catch the two drifting apart — a column added to the example that
// the validator does not know, or a row it advertises as working and is not.
describe('data/guests.example.csv', () => {
	const example = readFileSync(
		new URL('../../../data/guests.example.csv', import.meta.url),
		'utf8'
	);

	it('validates with no problems', () => {
		expect(validateGuests(parseCsv(example)).problems).toEqual([]);
	});

	// Otherwise the example teaches nothing about the one thing it is least able to
	// put in prose: what dropping a household actually looks like.
	it('demonstrates an archived household', () => {
		const { guests } = validateGuests(parseCsv(example));

		expect(guests.some((guest) => !guest.active)).toBe(true);
	});

	// Otherwise the example teaches nothing about the column that is hardest to
	// guess at: whether it takes the whole message or only the greeting.
	it('demonstrates a household with its own invitation', () => {
		const { guests } = validateGuests(parseCsv(example));
		const custom = guests.find((guest) => guest.customMessage);

		expect(custom).toBeTruthy();
		expect(custom?.customMessage).toContain('{household}');
	});

	it('leaves the rest of the example on the shared template', () => {
		const { guests } = validateGuests(parseCsv(example));

		expect(guests.filter((guest) => guest.customMessage)).toHaveLength(1);
	});
});

describe('the invitation column', () => {
	function guest(row: string) {
		const { guests, problems } = validateGuests(parseCsv(`household,seats,invitation\n${row}`));

		return { customMessage: guests[0]?.customMessage ?? '', problems };
	}

	it('is blank unless the couple writes one', () => {
		expect(guest('Santos,2,').customMessage).toBe('');
	});

	it('carries the wording through, commas and newlines included', () => {
		expect(guest('Santos,2,"Hi there,\nwe would love you."').customMessage).toBe(
			'Hi there,\nwe would love you.'
		);
	});

	// The same limit the dashboard form enforces, so a spreadsheet cannot seed a
	// document the dashboard would then refuse to edit back.
	it('refuses one longer than the dashboard accepts', () => {
		const { problems } = guest(`Santos,2,"${'x'.repeat(MAX_CUSTOM_MESSAGE + 1)}"`);

		expect(problems.some((problem) => problem.includes('`invitation`'))).toBe(true);
	});
});

const HOUSEHOLD = {
	householdName: 'Dela Cruz Family',
	side: 'bride' as const,
	seatsAllocated: 4,
	active: true,
	contactEmail: 'jc@example.com',
	notes: '',
	customMessage: ''
};

describe('newHousehold', () => {
	/**
	 * The one that matters. `isBeforeCutoff()` in the deployed rules branches on
	 * `resource.data.status == 'pending'`; a household created without `status`
	 * reads as `null` there, fails that branch, and is refused after the deadline
	 * having never been asked. Adding a guest-writable field to `ResponseFields`
	 * without giving it a blank value would reproduce that.
	 */
	it('starts with exactly the keys a guest is allowed to change', () => {
		expect(Object.keys(blankResponseFields()).sort()).toEqual([...RESPONSE_FIELDS].sort());
	});

	it('starts pending, with nobody confirmed', () => {
		expect(blankResponseFields()).toMatchObject({ status: 'pending', partySize: 0 });
	});

	it('carries the couple\'s own fields and nothing guest-writable on top', () => {
		const doc = newHousehold(HOUSEHOLD);

		expect(doc).toMatchObject({
			schemaVersion: SCHEMA_VERSION,
			householdName: 'Dela Cruz Family',
			seatsAllocated: 4,
			active: true
		});
	});

	// Well-formed by construction. The admin branch short-circuits `isWellFormed()`,
	// so a create *can* produce a document the guest rules would refuse — and a
	// household that cannot RSVP is invisible, because it never gets far enough to
	// complain.
	it('is a document the guest rules would accept an answer against', () => {
		const doc = newHousehold(HOUSEHOLD);

		expect(doc.partySize).toBeLessThanOrEqual(doc.seatsAllocated);
		expect(doc.status === 'pending' ? doc.partySize === 0 : doc.partySize >= 1).toBe(true);
	});

	// What the seed writes on a re-run: the couple's fields, so a collected answer
	// is never in the write.
	it('separates the owner fields from the blank response', () => {
		expect(Object.keys(ownerFields(HOUSEHOLD))).not.toContain('partySize');
		expect(Object.keys(newHousehold(HOUSEHOLD))).toEqual(
			expect.arrayContaining([...Object.keys(ownerFields(HOUSEHOLD)), ...Object.keys(blankResponseFields())])
		);
	});
});

describe('isValidSeatCount', () => {
	it('refuses zero and fractions', () => {
		expect(isValidSeatCount(0)).toBe(false);
		expect(isValidSeatCount(2.5)).toBe(false);
		expect(isValidSeatCount(Number.NaN)).toBe(false);
	});

	it('accepts a whole number of at least one', () => {
		expect(isValidSeatCount(1)).toBe(true);
		expect(isValidSeatCount(12)).toBe(true);
	});
});