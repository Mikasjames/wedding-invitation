import { describe, expect, it } from 'vitest';
import { formatTimestamp } from './format';
import { wedding } from '../lib/wedding';

describe('formatTimestamp', () => {
	// The whole point of the pin, stated as an assertion: this instant is already
	// the 16th in Manila, and a formatter that fell through to the device zone
	// would print the 15th on any machine not itself set to Asia/Manila — which is
	// every machine the CI runner is likely to be, and every laptop the couple
	// might open this on while abroad.
	it('reads in Philippine time whatever the device is set to', () => {
		expect(formatTimestamp(new Date('2027-01-15T23:30:00Z'))).toBe('16 Jan 2027, 07:30 PHT');
	});

	it('names the zone rather than leaving the reader to assume', () => {
		expect(formatTimestamp(new Date('2027-01-15T13:32:00Z'))).toContain(
			wedding.timeZoneLabel
		);
	});

	it('is empty for a household that has not replied', () => {
		expect(formatTimestamp(null)).toBe('');
	});

	// `Intl.DateTimeFormat.format` throws a RangeError on an unusable date, and
	// called from a template that blanks the dashboard rather than missing a row.
	it('is empty rather than throwing on an unusable date', () => {
		expect(formatTimestamp(new Date('nonsense'))).toBe('');
	});

	it('gives the same answer for the same instant, every time', () => {
		const at = new Date('2027-02-20T04:05:06Z');

		expect(formatTimestamp(at)).toBe(formatTimestamp(new Date(at.getTime())));
	});

	it('does not shift the day for an evening reply', () => {
		// The common case: a guest answers at 10pm their own time. Read in the
		// device's zone that is a different evening, and on a laptop west of the
		// Philippines it can even be the wrong calendar day.
		expect(formatTimestamp(new Date('2027-01-15T16:00:00Z'))).toBe('16 Jan 2027, 00:00 PHT');
	});
});