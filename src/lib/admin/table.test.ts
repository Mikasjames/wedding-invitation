import { describe, expect, it } from 'vitest';
import { readAdminRow, type AdminRow } from './row';
import {
	FILTERS,
	type Filter,
	type SortKey,
	countsFor,
	matchesFilter,
	matchesQuery,
	sortRowsBy,
	visibleRows
} from './table';

/**
 * The code is `readAdminRow`'s first argument rather than document data, so it has
 * to be lifted out of the overrides — otherwise every fixture silently shares the
 * default code and any test that sorts or searches by it compares identical keys.
 */
function row(overrides: Partial<AdminRow> = {}): AdminRow {
	const { code = 'W8K9JPTR4M', ...data } = overrides;

	return readAdminRow(code, {
		householdName: 'Dela Cruz Family',
		side: 'bride',
		seatsAllocated: 4,
		active: true,
		status: 'pending',
		partySize: 0,
		...data
	})!;
}

const SANTOS = row({ code: 'AAAAAAAAA1', householdName: 'Santos', status: 'attending', partySize: 2 });
const LIM = row({ code: 'BBBBBBBBB2', householdName: 'Lim, Maria Cristina', status: 'declined', partySize: 0 });
const AGUINALDO = row({ code: 'CCCCCCCCC3', householdName: 'Aguinaldo', seatsAllocated: 2, status: 'attending', partySize: 5 });
const ARCHIVED = row({ code: 'DDDDDDDDD4', householdName: 'Dropped', active: false, status: 'declined' });
const ALL = [SANTOS, LIM, AGUINALDO, ARCHIVED];

function names(rows: AdminRow[]): string[] {
	return rows.map((r) => r.householdName);
}

function sortedBy(key: SortKey, direction: 'asc' | 'desc' = 'asc'): string[] {
	return names(sortRowsBy(ALL, key, direction));
}

describe('matchesQuery', () => {
	it('matches on the household name, in any case', () => {
		expect(matchesQuery(SANTOS, 'santos')).toBe(true);
		expect(matchesQuery(SANTOS, 'SANTO')).toBe(true);
	});

	it('matches part of a name, not just the start', () => {
		expect(matchesQuery(LIM, 'cristina')).toBe(true);
		expect(matchesQuery(LIM, 'lim, maria')).toBe(true);
	});

	it('matches on the code, whatever case it is typed', () => {
		expect(matchesQuery(SANTOS, 'aaaaaaaaa1')).toBe(true);
		expect(matchesQuery(SANTOS, 'AAAAAAAAA1')).toBe(true);
	});

	it('matches on an attendee name the guest supplied', () => {
		expect(matchesQuery(row({ attendeeNames: ['Juan', 'Ana'] }), 'ana')).toBe(true);
	});

	it('matches on the contact email', () => {
		expect(matchesQuery(row({ contactEmail: 'Ma.Cristina@Example.com' }), 'cristina@')).toBe(true);
	});

	// Empty is not a filter — `visibleRows` and `countsFor` both call this without
	// guarding, so it has to be true rather than false.
	it('matches everything when nothing has been typed', () => {
		for (const blank of ['', '   ', '\n']) {
			expect(ALL.every((r) => matchesQuery(r, blank)), JSON.stringify(blank)).toBe(true);
		}
	});

	// Both are long free text, where a one-character hit lands somewhere arbitrary.
	it('does not search the notes or the guest\'s message', () => {
		const written = row({ notes: 'ring the plumber', message: 'Congratulations!' });

		expect(matchesQuery(written, 'plumber')).toBe(false);
		expect(matchesQuery(written, 'congratulations')).toBe(false);
	});

	it('finds nothing for a household that does not match', () => {
		expect(matchesQuery(SANTOS, 'zzzz')).toBe(false);
	});
});

describe('matchesFilter', () => {
	it('keeps everything under all', () => {
		expect(ALL.every((r) => matchesFilter(r, 'all'))).toBe(true);
	});

	it('finds only archived under archived', () => {
		expect(ALL.filter((r) => matchesFilter(r, 'archived'))).toEqual([ARCHIVED]);
	});

	// `totals()` skips archived rows before counting, so an active-only chip is
	// the same population as the figure above it. A chip that counted them would
	// disagree with the strip on the same screen.
	it('excludes archived households from every status bucket', () => {
		const archivedAttending = row({ active: false, status: 'attending' });

		for (const filter of ['awaiting', 'attending', 'declined', 'over'] as Filter[]) {
			expect(matchesFilter(archivedAttending, filter), filter).toBe(false);
		}
	});

	it('maps the buckets onto statuses', () => {
		expect(matchesFilter(SANTOS, 'attending')).toBe(true);
		expect(matchesFilter(LIM, 'declined')).toBe(true);
		expect(matchesFilter(row({ status: 'pending' }), 'awaiting')).toBe(true);
	});

	// The badge is not active-only, the chip is, and deliberately: the chip is a
	// number being compared against the over-committed figure in the totals strip.
	it('finds over-committed households among the active', () => {
		expect(matchesFilter(AGUINALDO, 'over')).toBe(true);
		expect(matchesFilter(SANTOS, 'over')).toBe(false);
		expect(matchesFilter(row({ active: false, partySize: 9, seatsAllocated: 1 }), 'over')).toBe(
			false
		);
	});
});

describe('countsFor', () => {
	it('counts every bucket across the list', () => {
		expect(countsFor(ALL, '')).toEqual({
			all: 4,
			awaiting: 0,
			attending: 2,
			declined: 1,
			archived: 1,
			over: 1
		});
	});

	// Faceted on the query: search "Santos" and the chips describe the Santos,
	// not the whole list. Whole-list counts here would read as a chip saying 2
	// above a list showing 1, which is worse than no chip.
	it('narrows to what was typed, ignoring the filter itself', () => {
		expect(countsFor(ALL, 'cristina')).toEqual({
			all: 1,
			awaiting: 0,
			attending: 0,
			declined: 1,
			archived: 0,
			over: 0
		});
	});

	// A filter that excludes everything must not zero the other chips, or the
	// couple loses their bearings the moment they click one.
	it('does not apply the active filter to the counts', () => {
		const counts = countsFor(ALL, '');

		for (const filter of FILTERS) {
			expect(typeof counts[filter], filter).toBe('number');
		}

		expect(counts.over).toBe(1);
	});
});

describe('sortRowsBy', () => {
	it('orders by name, using locale rules rather than codepoints', () => {
		expect(sortedBy('household')).toEqual([
			'Aguinaldo',
			'Lim, Maria Cristina',
			'Santos',
			'Dropped'
		]);
	});

	it('reverses on desc', () => {
		expect(sortedBy('household', 'desc')).toEqual([
			'Santos',
			'Lim, Maria Cristina',
			'Aguinaldo',
			'Dropped'
		]);
	});

	// Both directions, because the direction is a statement about the column and
	// not about whether archived households exist.
	it('sinks archived households in both directions', () => {
		for (const direction of ['asc', 'desc'] as const) {
			expect(sortedBy('household', direction).at(-1), direction).toBe('Dropped');
		}
	});

	it('orders numerically by seats rather than as text', () => {
		// As strings "10" sorts before "2", which is the whole point.
		expect(
			names(
				sortRowsBy(
					[
						row({ householdName: 'Ten', seatsAllocated: 10 }),
						row({ householdName: 'Two', seatsAllocated: 2 })
					],
					'seats',
					'asc'
				)
			)
		).toEqual(['Two', 'Ten']);
	});

	// Ascending, with archived last regardless of the direction — Lim is the only
	// active household that has confirmed nobody.
	it('orders by confirmed heads', () => {
		expect(sortedBy('confirmed')).toEqual([
			'Lim, Maria Cristina',
			'Santos',
			'Aguinaldo',
			'Dropped'
		]);
	});

	// Epoch-zero rather than special-cased to the end, so "least recently
	// answered" is a claim the sort can actually make.
	it('puts a household that has never replied among the oldest', () => {
		const replied = row({ code: 'R', householdName: 'Replied', respondedAt: new Date('2027-01-01') });
		const never = row({ code: 'N', householdName: 'Never' });

		expect(names(sortRowsBy([replied, never], 'responded', 'desc'))).toEqual(['Replied', 'Never']);
		expect(names(sortRowsBy([replied, never], 'responded', 'asc'))).toEqual(['Never', 'Replied']);
	});

	it('leaves the rows it was given alone', () => {
		const before = names(ALL);

		sortRowsBy(ALL, 'seats', 'desc');

		expect(names(ALL)).toEqual(before);
	});
});

describe('visibleRows', () => {
	const view = { query: '', filter: 'all' as Filter, sort: 'household' as SortKey, direction: 'asc' as const };

	it('returns everything in name order by default', () => {
		expect(names(visibleRows(ALL, view))).toEqual([
			'Aguinaldo',
			'Lim, Maria Cristina',
			'Santos',
			'Dropped'
		]);
	});

	// Both active and attending, both containing an "a", in name order.
	it('narrows by filter and query together', async () => {
		expect(names(visibleRows(ALL, { ...view, filter: 'attending', query: 'a' }))).toEqual([
			'Aguinaldo',
			'Santos'
		]);
	});

	it('can return nothing at all', () => {
		expect(visibleRows(ALL, { ...view, query: 'zzzz' })).toEqual([]);
	});
});

describe('sorting leaves the source list alone', () => {
	// The backend hands over its array and the dashboard keeps it as the source for
	// the totals strip, so a sort that mutated it would quietly reorder every
	// subsequent read as well.
	it('does not mutate the rows it was given', () => {
		const before = names(ALL);

		visibleRows(ALL, { query: '', filter: 'all', sort: 'code', direction: 'desc' });

		expect(names(ALL)).toEqual(before);
	});
});
