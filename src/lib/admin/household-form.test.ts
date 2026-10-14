import { describe, expect, it } from 'vitest';
import {
	type HouseholdEditForm,
	type HouseholdForm,
	validateHousehold,
	validateHouseholdEdit
} from './household-form';
import { MAX_CUSTOM_MESSAGE } from '../rsvp/message';

const GOOD: HouseholdForm = {
	householdName: 'Dela Cruz Family',
	customMessage: '',
	seats: 4,
	side: 'bride',
	email: '',
	notes: '',
	code: ''
};

function check(overrides: Partial<HouseholdForm> = {}) {
	return validateHousehold({ ...GOOD, ...overrides });
}

describe('validateHousehold', () => {
	it('accepts a well-formed household', () => {
		const result = check();

		expect(result.ok).toBe(true);
		expect(result.ok && result.household).toEqual({
			householdName: 'Dela Cruz Family',
			side: 'bride',
			seatsAllocated: 4,
			contactEmail: null,
			notes: '',
			customMessage: ''
		});
	});

	// The bug this was extracted to prevent: `seats` came off a number input, so
	// it was never a string, and `seats.trim()` threw on the first real submit.
	it('treats an empty number input as missing rather than calling trim on it', () => {
		const result = check({ seats: null });

		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems.seats).toBe('How many seats are reserved for them?');
	});

	it('refuses fewer than one seat, as the seed does', () => {
		for (const seats of [0, -1, 2.5, Number.NaN]) {
			const result = check({ seats });

			expect(result.ok, String(seats)).toBe(false);
		}
	});

	it('asks for a name', () => {
		const result = check({ householdName: '   ' });

		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems.householdName).toBeTruthy();
	});

	it('refuses an address that does not look like one, and allows none', () => {
		expect(check({ email: 'not-an-address' }).ok).toBe(false);
		expect(check({ email: '   ' }).ok).toBe(true);
		expect(check({ email: ' jc@example.com ' }).ok).toBe(true);
	});

	// Load-bearing, and invisible if it regresses to `code: ''`: the client does
	// `household.code ?? generateCode()`, and `'' ?? fallback` is `''`. An empty
	// string would then be used as the document ID.
	it('omits the code entirely when it is blank', () => {
		const result = check();

		expect(result.ok && 'code' in result.household).toBe(false);
	});

	// The same normalisation a guest's typed code goes through. Uppercasing alone
	// would let `W8K9JPTR4I` through — I is not in the alphabet, so
	// isKnownCode() in the deployed rules refuses it and the household exists but
	// can never be reached. The form would be manufacturing the dead end it exists
	// to avoid.
	it('normalises a supplied code the way a printed card reads', () => {
		for (const [typed, expected] of [
			['w8k9jptr4i', 'W8K9JPTR41'],
			['W8K9JPTR4O', 'W8K9JPTR40'],
			['  w8k9jptr4m  ', 'W8K9JPTR4M']
		]) {
			const result = check({ code: typed });

			expect(result.ok && result.household.code, typed).toBe(expected);
		}
	});

	it('refuses a code that cannot be one', () => {
		for (const code of ['too-short', '12345', 'abcdefghijklmnop']) {
			const result = check({ code });

			expect(result.ok, code).toBe(false);
			expect(!result.ok && result.problems.code, code).toBeTruthy();
		}
	});

	// The reason the field runs through `normalizeCode` rather than `.toUpperCase()`:
	// I is not in the alphabet, but it is exactly what someone types when they
	// mean a 1, and folding it is how the code on the card gets reached at all.
	it('reads a mistyped I as a 1 rather than refusing the card', () => {
		const result = check({ code: 'ABCDEFGHIJ' });

		expect(result.ok && result.household.code).toBe('ABCDEFGH1J');
	});

	it('trims the couple\'s own fields', () => {
		const result = check({ householdName: '  Santos  ', notes: '  corner table  ' });

		expect(result.ok && result.household.householdName).toBe('Santos');
		expect(result.ok && result.household.notes).toBe('corner table');
	});

	it('reports every problem at once rather than one per attempt', () => {
		const result = check({ householdName: '', seats: 0, email: 'nope' });

		expect(!result.ok && Object.keys(result.problems).sort()).toEqual([
			'email',
			'householdName',
			'seats'
		]);
	});

	// An emptied textarea leaves whitespace behind, and a message of spaces stored
	// on the document is one the dashboard would show as "in your own words" over a
	// household that has none.
	it('treats a blank custom message as no custom message', () => {
		const result = check({ customMessage: '   \n  ' });

		expect(result.ok && result.household.customMessage).toBe('');
	});

	it('keeps the wording a household was given, whitespace and all inside it', () => {
		const result = check({ customMessage: '  Hi {household}!\n\nDo come.  ' });

		expect(result.ok && result.household.customMessage).toBe('Hi {household}!\n\nDo come.');
	});

	// Caught here rather than at the store, so the couple sees it while the text is
	// still in front of them.
	it('refuses a custom message longer than the limit', () => {
		const result = check({ customMessage: 'x'.repeat(MAX_CUSTOM_MESSAGE + 1) });

		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems.customMessage).toContain(String(MAX_CUSTOM_MESSAGE));
	});
});
const EDIT: HouseholdEditForm = {
	householdName: 'Dela Cruz Family',
	seatsAllocated: 4,
	side: 'bride',
	contactEmail: '',
	notes: '',
	active: true
};

function checkEdit(overrides: Partial<HouseholdEditForm> = {}, partySize = 0) {
	return validateHouseholdEdit({ ...EDIT, ...overrides }, partySize);
}

describe('validateHouseholdEdit', () => {
	it('accepts a well-formed edit', () => {
		const result = checkEdit();

		expect(result.ok && result.edit).toEqual({
			householdName: 'Dela Cruz Family',
			seatsAllocated: 4,
			side: 'bride',
			contactEmail: null,
			notes: '',
			active: true
		});
	});

	it('trims the name and the notes', () => {
		const result = checkEdit({ householdName: '  Santos  ', notes: ' a seat  ' });

		expect(result.ok && result.edit.householdName).toBe('Santos');
		expect(result.ok && result.edit.notes).toBe('a seat');
	});

	// The rule the deployed `seatCountStaysValid()` also enforces. Lowering seats
	// under a confirmed party produces a document that fails `isWellFormed()`, and
	// that household's next RSVP fails the same check — they cannot lower their own
	// `partySize` to escape it, so there is no route back for them.
	it('refuses seats below a confirmed party', () => {
		const result = checkEdit({ seatsAllocated: 2 }, 3);

		expect(result.ok).toBe(false);
		expect(!result.ok && result.problems.seatsAllocated).toContain('3 seats');
	});

	// Why the message above is always plural. One seat is the smallest allocation
	// `isValidSeatCount` permits, so a household that confirmed exactly one can never
	// conflict with a valid number — the singular branch is unreachable, and a
	// `partySize === 1` special case would be untestable code.
	it('cannot conflict for a household that confirmed exactly one', () => {
		expect(checkEdit({ seatsAllocated: 1 }, 1).ok).toBe(true);
		expect(checkEdit({ seatsAllocated: 0 }, 1).ok).toBe(false);
	});

	// The asymmetry that keeps the repair open. An over-committed household is fixed
	// by raising its allocation to meet the confirmed count, so the guard must let
	// that through or the dashboard becomes the one place a broken household cannot
	// be rescued from.
	it('allows seats up to the confirmed count', () => {
		const result = checkEdit({ seatsAllocated: 3 }, 3);

		expect(result.ok && result.edit.seatsAllocated).toBe(3);
	});

	it('allows raising seats above the confirmed count', () => {
		const result = checkEdit({ seatsAllocated: 9 }, 3);

		expect(result.ok && result.edit.seatsAllocated).toBe(9);
	});

	// A household nobody has answered has nothing to be stranded by, so the seat
	// check is the plain one `validateHousehold` applies.
	it('holds seats to one when nobody has confirmed', () => {
		expect(checkEdit({ seatsAllocated: 0 }).ok).toBe(false);
		expect(checkEdit({ seatsAllocated: 1 }).ok).toBe(true);
	});

	it('asks for a seat count rather than reporting a bad one', () => {
		const result = checkEdit({ seatsAllocated: null });

		expect(!result.ok && result.problems.seatsAllocated).toContain('How many seats');
	});

	// Editing clears an email, so that has to be possible — or a mistyped address
	// could never be removed.
	it('treats a cleared email as none rather than as invalid', () => {
		expect(checkEdit({ contactEmail: '   ' }).ok).toBe(true);
	});

	it('rejects an email that does not look like one', () => {
		const result = checkEdit({ contactEmail: 'nope' });

		expect(!result.ok && result.problems.contactEmail).toBeTruthy();
	});

	it('asks for a name rather than storing a blank one', () => {
		const result = checkEdit({ householdName: '  ' });

		expect(!result.ok && result.problems.householdName).toBeTruthy();
	});

	// Archiving is a save like any other and carries no extra validation. What it
	// does to the household's link is the component's to warn about, because that is
	// a thing to be told rather than a thing to be checked.
	it('accepts an archive', () => {
		const result = checkEdit({ active: false });

		expect(result.ok && result.edit.active).toBe(false);
	});
});
