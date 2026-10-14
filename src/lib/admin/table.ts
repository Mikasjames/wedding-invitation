import type { RsvpStatus } from '../rsvp/types';
import type { AdminRow } from './row';

/**
 * Which slice of the guest list is on screen.
 *
 * `archived` is the only one that looks at `active: false`; everything else is
 * active-only, which is why there is no `archived` badge sitting next to an
 * `attending` chip that counted it.
 */
export type Filter =
	| 'all'
	| 'awaiting'
	| 'attending'
	| 'declined'
	| 'archived'
	| 'over';

/**
 * What the list can be ordered by.
 *
 * Deliberately no `status`. The order a status has is arbitrary, and "who has
 * not answered" is what the filter is for. `responded` covers the chasing case,
 * with households that have never replied sorting as though they replied
 * longest ago.
 */
export type SortKey = 'household' | 'code' | 'seats' | 'confirmed' | 'responded';

export type SortDirection = 'asc' | 'desc';

/** In the order the chips are shown, so the two cannot drift apart. */
export const FILTERS: readonly Filter[] = [
	'all',
	'awaiting',
	'attending',
	'declined',
	'archived',
	'over'
];

export interface TableView {
	query: string;
	filter: Filter;
	sort: SortKey;
	direction: SortDirection;
}

/** The three status buckets, which are what a household is rather than how it was written to. */
const STATUS: Record<'awaiting' | 'attending' | 'declined', RsvpStatus> = {
	awaiting: 'pending',
	attending: 'attending',
	declined: 'declined'
};

/**
 * Whether a household matches what the couple has typed.
 *
 * Identifiers only — household name, code, contact email and the attendee names
 * they supplied. Not the guest's note back or the couple's own notes: both are
 * long free text where a one-character substring hit lands somewhere arbitrary,
 * and a search box that appears to work but returns something random is worse
 * than one with a narrower contract.
 *
 * Substring rather than prefix, and that is what makes the `Ma. Cristina` versus
 * `Maria Cristina` problem smaller here than it is on the guest side, not larger:
 * the guest side has no search at all precisely because it cannot be made robust,
 * whereas `cristina` matches both spellings without either being special-cased.
 *
 * Codes are lowercased alongside the query so a card read over someone's shoulder
 * still matches, since Crockford base32 has no case of its own to compare against.
 */
export function matchesQuery(row: AdminRow, query: string): boolean {
	const needle = query.trim().toLowerCase();

	// Empty is not a filter. Returning true here rather than at every call site is
	// why there is no `if (query)` wrapper anywhere above this function.
	if (!needle) return true;

	return (
		row.householdName.toLowerCase().includes(needle) ||
		row.code.toLowerCase().includes(needle) ||
		row.attendeeNames.some((name) => name.toLowerCase().includes(needle)) ||
		(row.contactEmail?.toLowerCase().includes(needle) ?? false)
	);
}

/**
 * Whether a household belongs in the current chip.
 *
 * Active-only for every status bucket, so a chip's count is the same population
 * the figure above it came from. `totals()` skips archived rows before it counts
 * anything, so "3 attending" on a chip and "3" in the totals strip are the same
 * three households — which is the point of showing both on one screen.
 *
 * `over` is active-only for the same reason, even though the row's `Over` badge
 * is not: the badge marks a broken document wherever it sits, the chip is a
 * count the couple is comparing against the over-committed figure in the strip.
 */
export function matchesFilter(row: AdminRow, filter: Filter): boolean {
	if (filter === 'all') return true;

	if (filter === 'archived') return !row.active;

	if (!row.active) return false;

	return filter === 'over' ? row.overcommitted : row.status === STATUS[filter];
}

/** How many households sit in each bucket. */
export function countsFor(rows: AdminRow[], query: string): Record<Filter, number> {
	const counts = {
		all: 0,
		awaiting: 0,
		attending: 0,
		declined: 0,
		archived: 0,
		over: 0
	};

	for (const row of rows) {
		if (!matchesQuery(row, query)) continue;

		for (const filter of FILTERS) {
			if (matchesFilter(row, filter)) counts[filter] += 1;
		}
	}

	return counts;
}

function compare(a: AdminRow, b: AdminRow, key: SortKey): number {
	switch (key) {
		case 'household':
			return a.householdName.localeCompare(b.householdName);
		case 'code':
			return a.code.localeCompare(b.code);
		case 'seats':
			return a.seatsAllocated - b.seatsAllocated;
		case 'confirmed':
			return a.partySize - b.partySize;
		case 'responded':
			// A household that has never replied sorts as though it replied at the
			// epoch, which puts it among the longest-unanswered rather than at the
			// top under `desc`. Special-casing it to the end would be a different
			// claim about what it means.
			return (a.respondedAt?.getTime() ?? 0) - (b.respondedAt?.getTime() ?? 0);
	}
}

/**
 * Orders the list, and is the only place order is decided.
 *
 * Archived households sink below everything in both directions. Sorting a list
 * the couple has mostly stopped using should not drag it back to the top because
 * they clicked a column header, and the `Archived` chip is there for when they do
 * want them. Applying the direction to the chosen key but not to that grouping is
 * deliberate: the direction is a statement about the column, not about whether
 * archived households exist.
 */
export function sortRowsBy(
	rows: AdminRow[],
	sort: SortKey,
	direction: SortDirection
): AdminRow[] {
	const sign = direction === 'desc' ? -1 : 1;

	return [...rows].sort((a, b) => {
		if (a.active !== b.active) return a.active ? -1 : 1;

		return sign * compare(a, b, sort);
	});
}

/**
 * The rows on screen: narrowed, then searched, then ordered.
 *
 * One function, because the table and the phone cards both call it and two
 * versions would be two answers to "what is on screen" — the same reason
 * `HouseholdBadges` exists.
 */
export function visibleRows(rows: AdminRow[], view: TableView): AdminRow[] {
	return sortRowsBy(
		rows.filter((row) => matchesFilter(row, view.filter) && matchesQuery(row, view.query)),
		view.sort,
		view.direction
	);
}