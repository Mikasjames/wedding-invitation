const start = new Date('2027-06-12T16:00:00+02:00');

export const wedding = {
	names: 'Michal & Lemuel',

	monogram: 'M & L',

	description:
		'We are getting married. Join us for an evening of vows, music and far too much champagne.',

	start,

	dateLabel: 'Saturday, 12 June 2027',

	dateShort: '12 · 06 · 2027',

	timeLabel: 'Four in the afternoon, until the small hours',

	city: 'Tanza, Cavite',

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
