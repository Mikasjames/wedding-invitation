import type { AdminRow } from './row';
import { parseCsv } from '../rsvp/guests';

/**
 * Dashboard export.
 *
 * Every field is quoted unconditionally. Quoting only when necessary is a few
 * characters shorter and produces files that are correct until someone puts a
 * comma in a dietary note — which they will, the moment there are two of them.
 * Always-quoted also round-trips through `parseCsv` exactly.
 */
function cell(value: string | number | null): string {
	const text = value === null ? '' : String(value);

	return `"${text.replaceAll('"', '""')}"`;
}

function row(cells: Array<string | number | null>): string {
	return cells.map(cell).join(',');
}

/** ISO 8601, so a spreadsheet reads it as a date rather than as text. */
function timestamp(date: Date | null): string {
	return date ? date.toISOString() : '';
}

/**
 * Exports households for whoever needs the headcount — the caterer, the venue, a
 * backup of the couple's own records.
 *
 * Column order leads with what a caterer reads and trails with what only the
 * couple uses. Archived households carry `active` as `false` rather than being
 * dropped, so the file is a complete record and the reader can filter.
 *
 * This is an output, not a seed file. The `household`/`side`/`seats`/`code`
 * columns are shaped so `pnpm seed` *could* read it back, and re-importing is
 * safe — the seed script leaves existing responses alone — but responses here are
 * a snapshot for reading, not a source of truth for writing.
 */
export function toCsv(rows: AdminRow[]): string {
	const lines = [
		row([
			'code',
			'household',
			'side',
			'active',
			'seats',
			'status',
			'confirmed',
			'names',
			'dietary',
			'message',
			'email',
			'notes',
			'responded'
		])
	];

	for (const household of rows) {
		lines.push(
			row([
				household.code,
				household.householdName,
				household.side,
				household.active ? 'yes' : 'no',
				household.seatsAllocated,
				household.status,
				household.partySize,
				// An array has no honest single-cell form. Semicolons read as a list
				// in a spreadsheet and survive `parseCsv`, which only splits on commas.
				household.attendeeNames.join('; '),
				household.dietaryNotes,
				household.message,
				household.contactEmail,
				household.notes,
				timestamp(household.respondedAt)
			])
		);
	}

	return lines.join('\n') + '\n';
}

/** `rsvps-2027-01-15.csv`, so exports sort in a directory listing. */
export function csvFileName(now: Date = new Date()): string {
	return `rsvps-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Reads back an export produced by `toCsv`.
 *
 * Exists so a round trip can be asserted rather than assumed: quoting, embedded
 * commas, embedded newlines and empty cells all have to survive, and the only way
 * to know is to do it.
 */
export function fromCsv(text: string): Array<Record<string, string>> {
	const [header, ...body] = parseCsv(text);

	if (!header) return [];

	return body.map((cells) =>
		Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']))
	);
}

/** Narrows an export to the households a caterer actually needs. */
export function activeRows(rows: AdminRow[]): AdminRow[] {
	return rows.filter((row) => row.active);
}