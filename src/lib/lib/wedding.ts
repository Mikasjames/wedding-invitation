const start = new Date('2027-06-12T16:00:00+08:00');

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
		venue: 'To be announced',
		address: 'Tanza, Cavite, Philippines'
	},

	reception: {
		name: 'The Reception',
		venue: 'To be announced',
		address: 'Tanza, Cavite, Philippines'
	},

	rsvpBy: '1 April 2027',

	story: 'Placeholder story — how you met, the proposal, why Tanza. Replace this paragraph later.',

	events: [
		{
			name: 'Arrival & Welcome Drinks',
			time: '3:30 PM',
			venue: 'Tanza, Cavite, Philippines',
			description: 'Gather, mingle, and ease into the evening.'
		},
		{
			name: 'The Ceremony',
			time: '4:00 PM',
			venue: 'To be announced',
			description: 'Vows, music, and the moment itself.'
		},
		{
			name: 'Reception & After-Party',
			time: '6:00 PM',
			venue: 'To be announced',
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
