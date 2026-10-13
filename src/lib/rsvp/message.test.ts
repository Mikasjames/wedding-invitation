import { describe, expect, it } from 'vitest';
import { invitationLink, invitationMessage } from './message';
import { wedding } from '../lib/wedding';

const BASE = {
	household: 'Dela Cruz Family',
	seats: 4,
	code: 'W8K9JPTR4M',
	site: 'https://example.test'
};

describe('invitationMessage', () => {
	// Read from `wedding.ts` rather than repeated here and in the seed script. A
	// message that disagrees with the site about the deadline is read by a guest.
	it('carries the names and deadline from the site config', () => {
		const text = invitationMessage(BASE);

		expect(text).toContain(wedding.names);
		expect(text).toContain(wedding.rsvp.deadline);
	});

	it('carries the code and the seat count', () => {
		const text = invitationMessage(BASE);

		expect(text).toContain('W8K9JPTR4M');
		expect(text).toContain('4 seats');
	});

	it('agrees on a single seat', () => {
		expect(invitationMessage({ ...BASE, seats: 1 })).toContain('1 seat reserved');
	});

	it('writes a link the guest flow can read back', () => {
		// The same `?code=` shape `extractCode` looks for. A trailing slash on the
		// site would produce `//?code=`, which still parses but looks broken to a
		// guest reading it on paper.
		expect(invitationMessage(BASE)).toContain('https://example.test/?code=W8K9JPTR4M');
		expect(invitationMessage({ ...BASE, site: 'https://example.test/' })).toContain(
			'https://example.test/?code=W8K9JPTR4M'
		);
	});
});

describe('invitationLink', () => {
	it('matches the link in the message', () => {
		expect(invitationLink(BASE.site, BASE.code)).toBe(
			invitationMessage(BASE).match(/https:\/\/\S+\?code=\S+/)?.[0]
		);
	});
});