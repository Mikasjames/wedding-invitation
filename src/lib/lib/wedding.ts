/**
 * Single source of truth for everything the invitation says about the wedding.
 * Replace the placeholder values below with the real details — every section,
 * the <svelte:head> tags and the shareable map/calendar links all read from here.
 */

const start = new Date('2027-06-12T16:00:00+02:00');

export const wedding = {
	/** Display names, used in the hero and the share preview. */
	names: 'Michal & Lemuel',

	/** Initials stamped into the wax seal. */
	monogram: 'M & L',

	/** Single line for link previews and the hero subtitle. */
	description:
		'We are getting married. Join us for an evening of vows, music and far too much champagne.',

	/** Machine-readable start. Keep the timezone offset explicit. */
	start,

	/** Formatted for the hero: "Saturday, the twelfth of June · Two thousand twenty-seven" */
	dateLabel: 'Saturday, 12 June 2027',

	/** Short form used in tight spaces. */
	dateShort: '12 · 06 · 2027',

	timeLabel: 'Four in the afternoon, until the small hours',

	city: 'Como, Italy',

	ceremony: {
		name: 'The Ceremony',
		venue: 'Villa d’Este',
		address: 'Via Regina 40, 22016 Tremezzina CO, Italy'
	},

	reception: {
		name: 'The Reception',
		venue: 'Villa d’Este — Limonaia Terrace',
		address: 'Via Regina 40, 22016 Tremezzina CO, Italy'
	},

	rsvpBy: '1 April 2027'
} as const;
