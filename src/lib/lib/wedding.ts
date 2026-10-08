const start = new Date('2027-02-09T16:00:00+16:00');

export const wedding = {
	names: 'Michal & Lemuel',

	monogram: 'M & L',

	description:
		'We are getting married. Join us for an evening of vows, music and far too much champagne.',

	start,

	dateLabel: 'Tuesday, 9 February 2027',

	dateShort: '02 · 09 · 2027',

	timeLabel: 'Four in the afternoon, until the small hours',

	city: 'Tanza, Cavite',

	ceremony: {
		name: 'The Ceremony',
		venue: 'To be announced',
		address: 'Tanza, Cavite, Philippines'
	},

	reception: {
		name: 'The Reception',
		venue: 'Rio Delta',
		address: 'Tanza, Cavite, Philippines'
	},

	rsvpBy: '1 April 2027',

	story: 'Placeholder story — how you met, the proposal, why Tanza. Replace this paragraph later.',

	events: [
		{
			name: 'The Ceremony',
			time: '4:00 PM',
			venue: 'Kingdom Hall of Jehovah\'s Witnesses, Tanza, Cavite, Philippines',
			description: 'Vows, music, and the moment itself.'
		},
		{
			name: 'Reception & After-Party',
			time: '6:00 PM',
			venue: 'Rio Delta',
			description: 'Dinner, speeches, dancing, and far too much champagne.'
		}
	],
dressCode: {
		title: 'Barong Tagalog / Filipiniana',
		description:
			'Placeholder: formal barong or gown in earth tones. Filipiniana welcome. Replace with your actual dress code.'
	},

	rsvp: {
		deadline: '1 April 2027',
		endpoint: 'https://formspree.io/f/YOUR-FORM-ID',
		contact: 'to be announced'
	},

	registry: [
		{ name: 'Placeholder Registry One', url: 'https://example.com/registry-1' },
		{ name: 'Placeholder Registry Two', url: 'https://example.com/registry-2' }
	]
} as const;
