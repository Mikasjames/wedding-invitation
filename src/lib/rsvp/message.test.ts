import { describe, expect, it } from 'vitest';
import { invitationLink, invitationMessage, renderTemplate } from './message';
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

describe('renderTemplate', () => {
	it('fills every token it recognises', () => {
		expect(
			renderTemplate('Hi {household}, {seats}.', { household: 'Santos', seats: '2 seats' })
		).toBe('Hi Santos, 2 seats.');
	});

	// A typo must be visible in the preview and in the message the couple sends,
	// not swallow a word. `{namse}` reaching a guest looks like a bug; a silently
	// blank one does too, and gives nobody anything to search for.
	it('leaves an unrecognised token exactly as written', () => {
		expect(renderTemplate('Hi {namse}!', { household: 'Santos' })).toBe('Hi {namse}!');
	});

	it('leaves braces that are not tokens alone', () => {
		expect(renderTemplate('Use {JSON} or { } freely', {})).toBe('Use {JSON} or { } freely');
	});
});

describe('a household with its own message', () => {
	const own = 'Hi {household}!\n\nIt has been years. We would love you there.\n\n{link}';

	it('replaces the template entirely', () => {
		const text = invitationMessage({ ...BASE, custom: own });

		expect(text).toContain('It has been years.');
		// The shared wording is gone rather than appended to — a hybrid would be
		// neither the couple's words nor the template.
		expect(text).not.toContain('would be honoured by your presence');
	});

	it('fills tokens the same way the template does', () => {
		expect(invitationMessage({ ...BASE, custom: own })).toContain('Hi Dela Cruz Family!');
	});

	// The one guarantee. A message with no link is not an invitation, and the
	// guest cannot tell you that is why they cannot reply.
	it('has the link put back when their text leaves it out', () => {
		const text = invitationMessage({
			...BASE,
			custom: 'Hi {household}!\n\nWe would love you there.'
		});

		expect(text).toContain('https://example.test/?code=W8K9JPTR4M');
	});

	it('does not add a second link when their text already has one', () => {
		const links = invitationMessage({ ...BASE, custom: own }).match(/https:\S+\?code=\S+/g) ?? [];

		expect(links).toHaveLength(1);
	});

	// Whitespace-only is what an emptied textarea leaves behind, and treating it
	// as a custom message would send a guest a blank invitation plus a link.
	it('falls back to the template when it is only whitespace', () => {
		expect(invitationMessage({ ...BASE, custom: '   \n  ' })).toBe(invitationMessage(BASE));
	});

	it('still offers the deadline as a token', () => {
		// Not re-attached automatically — that would make "custom" a lie — but it has
		// to be available to write, and this pins that the token resolves.
		expect(invitationMessage({ ...BASE, custom: 'Please reply by {deadline}.' })).toContain(
			wedding.rsvp.deadline
		);
	});
});