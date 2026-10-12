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

	it('has matching date labels', () => {
		expect(wedding.dateLabel).toContain('2027');
		expect(wedding.dateShort).toMatch(/\d{2} · \d{2} · 2027/);
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
});
