// The `.ts` extension is deliberate. This module is imported by
// `scripts/seed-rsvps.mjs`, which Node runs directly, and Node's ESM resolver
// will not guess an extension. Vite and TypeScript both handle it either way.
import { CODE_LENGTH, generateCode, normalizeCode } from './codes.ts';
import type { Side } from './types.ts';

/** One row of `data/guests.csv`, after validation. */
export interface GuestSeed {
	/** Spreadsheet row number, so error messages match what the couple sees. */
	line: number;
	code: string;
	householdName: string;
	side: Side;
	seatsAllocated: number;
	contactEmail: string | null;
	notes: string;
}

const SIDES = new Set(['bride', 'groom', 'both']);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The header the couple is given, and the two columns that are not optional. */
export const REQUIRED_COLUMNS = ['household', 'seats'] as const;
export const OPTIONAL_COLUMNS = ['side', 'code', 'email', 'notes'] as const;

/**
 * Minimal RFC4180 reader: quoted fields, embedded commas, `""` escapes, and the
 * BOM a spreadsheet export starts with — which would otherwise become part of
 * the first header name and make "household" unrecognised.
 */
export function parseCsv(text: string): string[][] {
	const source = text.replace(/^﻿/, '');

	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	const endField = () => {
		row.push(field.trim());
		field = '';
	};

	for (let i = 0; i < source.length; i++) {
		const char = source[i];

		if (quoted) {
			if (char !== '"') field += char;
			else if (source[i + 1] === '"') (field += '"'), i++;
			else quoted = false;
			continue;
		}

		if (char === '"') quoted = true;
		else if (char === ',') endField();
		else if (char === '\n') {
			endField();
			rows.push(row);
			row = [];
		} else if (char !== '\r') field += char;
	}

	if (field !== '' || row.length) {
		endField();
		rows.push(row);
	}

	return rows.filter((cells) => cells.some((cell) => cell !== ''));
}

/**
 * Validates every row before anything is written.
 *
 * Returns *all* the problems rather than the first, because the couple is going
 * to fix this spreadsheet in a browser, not a terminal, and finding them one
 * round trip at a time is miserable.
 *
 * Codes are assigned here rather than later so that two blank rows cannot
 * collide with each other.
 */
export function validateGuests(rows: string[][]): {
	guests: GuestSeed[];
	problems: string[];
} {
	const problems: string[] = [];
	const guests: GuestSeed[] = [];

	if (rows.length < 2) {
		problems.push('The CSV has no data rows — expected a header plus at least one guest.');
		return { guests, problems };
	}

	const header = rows[0].map((name) => name.toLowerCase());
	const column = (name: string) => header.indexOf(name);

	const missing = REQUIRED_COLUMNS.filter((name) => column(name) === -1);

	if (missing.length) {
		problems.push(`The header must include ${missing.map((n) => `\`${n}\``).join(' and ')}.`);
		return { guests, problems };
	}

	const at = (name: string) => column(name);
	const seen = new Map<string, string>();

	for (const [offset, cells] of rows.slice(1).entries()) {
		// +2 accounts for the header row, so the number matches the spreadsheet.
		const line = offset + 2;
		const fail = (message: string) => problems.push(`Row ${line}: ${message}`);

		const householdName = cells[at('household')] ?? '';
		if (!householdName) fail('`household` is empty.');

		// The couple gets this column wrong more than any other, and the flow reads
		// it back to them as "we have reserved N seats". Zero would produce a
		// household nobody is able to accept, so it is rejected rather than seeded.
		const rawSeats = cells[at('seats')] ?? '';
		const seats = Number(rawSeats);

		if (rawSeats === '') fail('`seats` is empty.');
		else if (!Number.isInteger(seats)) fail(`\`seats\` is "${rawSeats}", not a whole number.`);
		else if (seats < 1) fail(`\`seats\` is ${seats}. Every household needs at least one seat.`);

		const side = (cells[at('side')] ?? '').toLowerCase() || 'both';
		if (!SIDES.has(side)) fail(`\`side\` is "${side}" — use bride, groom or both.`);

		const rawEmail = cells[at('email')] ?? '';
		if (rawEmail && !EMAIL.test(rawEmail)) {
			fail(`\`email\` is "${rawEmail}", which does not look like an address.`);
		}

		const rawCode = cells[at('code')] ?? '';
		let code = normalizeCode(rawCode);

		if (rawCode && !code) {
			fail(
				`\`code\` is "${rawCode}". Leave it blank to have one generated, or supply ` +
					`${CODE_LENGTH} characters of 0-9 and A-Z without I, L, O or U.`
			);
		}

		if (!code) code = generateCode();

		const previous = seen.get(code);
		if (previous) {
			fail(`\`code\` ${code} is already used by "${previous}" earlier in this file.`);
		} else {
			seen.set(code, householdName || '(unnamed)');
		}

		guests.push({
			line,
			code,
			householdName,
			side: side as GuestSeed['side'],
			seatsAllocated: seats,
			contactEmail: rawEmail || null,
			notes: cells[at('notes')] ?? ''
		});
	}

	return { guests, problems };
}

/**
 * Totals for the line the couple reads when they run the script.
 *
 * Non-finite seat counts are skipped rather than summed. `validateGuests` reports
 * them and the seed script exits before it gets here, but a "NaN seats" in front
 * of a couple is a worse failure than an undercount, and guarding costs nothing.
 */
export function summarise(guests: GuestSeed[]): {
	households: number;
	seats: number;
	bySide: Record<Side, number>;
} {
	const bySide: Record<Side, number> = { bride: 0, groom: 0, both: 0 };

	for (const guest of guests) bySide[guest.side] += 1;

	const seats = guests.reduce(
		(total, guest) => (Number.isFinite(guest.seatsAllocated) ? total + guest.seatsAllocated : total),
		0
	);

	return { households: guests.length, seats, bySide };
}