import { describe, expect, it } from 'vitest';
import { wedding } from './wedding';

describe('wedding', () => {
	it('has a valid start date in the future', () => {
		expect(wedding.start.getTime()).not.toBeNaN();
		expect(wedding.start.getTime()).toBeGreaterThan(Date.now());
	});

	// The offset in `start` is the only thing that makes this a 4 PM ceremony,
	// and a wrong one is still a valid Date, so it slipped past the check above
	// for as long as the labels were hand-written. Assert the rendered
	// Philippine time instead: that is what the copy promises the guests.
	it('starts at 4 PM Philippine time', () => {
		expect(wedding.start.toLocaleString('en-GB', { timeZone: 'Asia/Manila' })).toBe(
			'09/02/2027, 16:00:00'
		);
	});

	// Both labels are derived from `start`, so pinning them here is what keeps
	// the two from drifting apart — the failure mode that let the offset above
	// go unnoticed for so long.
	it('derives its date labels from the start instant', () => {
		expect(wedding.dateLabel).toBe('Tuesday, 9 February 2027');
		expect(wedding.dateShort).toBe('02 · 09 · 2027');
	});

	// Pinned to Asia/Manila, so a guest on the far side of the date line still
	// reads the date the ceremony is actually on. Re-derive across a spread of
	// host zones and require the rendered label not to move.
	it('renders its labels in Philippine time regardless of the host zone', () => {
		const original = process.env.TZ;

		try {
			for (const hostZone of ['Pacific/Kiritimati', 'UTC', 'Pacific/Niue', 'America/Chicago']) {
				process.env.TZ = hostZone;

				const rendered = new Intl.DateTimeFormat('en-GB', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					timeZone: 'Asia/Manila'
				}).format(wedding.start);

				expect(rendered, `label under ${hostZone}`).toBe(wedding.dateLabel);
			}
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});

	it('has non-empty names and monogram', () => {
		expect(wedding.names.length).toBeGreaterThan(0);
		expect(wedding.monogram.length).toBeGreaterThan(0);
	});

	it('has ceremony and reception details', () => {
		expect(wedding.ceremony.name).toBeTruthy();
		expect(wedding.ceremony.venue).toBeTruthy();
		expect(wedding.ceremony.address).toBeTruthy();
		expect(wedding.reception.name).toBeTruthy();
		expect(wedding.reception.venue).toBeTruthy();
		expect(wedding.reception.address).toBeTruthy();
	});

	it('has a named, valid dress-code palette', () => {
		const palette = wedding.dressCode.palette;

		expect(palette.length).toBeGreaterThan(0);
		expect(new Set(palette.map((colour) => colour.name)).size).toBe(palette.length);

		for (const colour of palette) {
			expect(colour.name).toBeTruthy();
			expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	// The RSVP deadline was briefly set past the ceremony, which is invisible in
	// every other assertion here — both strings are well-formed dates. Parse the
	// label as written (it is a display string, not ISO) and require the cutoff to
	// fall before the ceremony, so the next person to retune one of the two finds
	// out from this failure instead of from the couple.
	it('closes RSVPs before the ceremony', () => {
		const deadline = Date.parse(wedding.rsvp.deadline);

		expect(Number.isNaN(deadline), `"${wedding.rsvp.deadline}" is not a readable date`).toBe(
			false
		);
		expect(deadline).toBeLessThan(wedding.start.getTime());
	});
});
