/** Tanza, Cavite. UTC+8 all year — the Philippines has no DST, so a fixed
 *  offset is exact. Written out rather than left as a bare local-time string,
 *  which resolves to a different instant on every guest's machine. */
const TIME_ZONE = 'Asia/Manila';

const start = new Date('2027-02-09T16:00:00+08:00');

/** Always in Philippine time, whatever the guest's own zone. The ceremony
 *  happens there, not where they happen to be reading. */
function inManila(date: Date, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: TIME_ZONE }).format(date);
}

/** `en-GB` is pinned so the order stays "9 February" rather than "February 9"
 *  on a guest whose locale would otherwise reorder it. */
const dateLabel = inManila(start, {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	year: 'numeric'
});

/** Intl has no option for "02 · 09 · 2027", so assemble it from the parts. */
const shortParts = new Intl.DateTimeFormat('en-GB', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	timeZone: TIME_ZONE
}).formatToParts(start);

function part(type: Intl.DateTimeFormatPartTypes): string {
	const found = shortParts.find((p) => p.type === type);
	if (!found) throw new Error(`missing ${type} in formatted date`);
	return found.value;
}

const dateShort = `${part('month')} · ${part('day')} · ${part('year')}`;

export const wedding = {
	names: 'Michal & Lemuel',

	monogram: 'M & L',

	description:
		'We are getting married. Join us for an evening of vows, music and far too much champagne.',

	start,

	dateLabel,

	dateShort,

	/** Event times are prose rather than formatted values, so the zone is
	 *  marked here for the sections that print them. */
	timeZoneLabel: 'PHT',

	city: 'Tanza, Cavite',

	/**
	 * How many guests the couple is planning for.
	 *
	 * Planning only: no guest sees it, and nothing enforces it. The dashboard
	 * compares the heads confirmed — and every seat still outstanding — against
	 * this number, so the couple can tell whether the list fits the room before
	 * invitations go out. That matters most when most households are families
	 * holding four or five seats each.
	 *
	 * `null` hides the comparison. Tentative while the count is still being
	 * settled, so change it here rather than in the dashboard.
	 */
	guestCapacity: 100 as number | null,

	ceremony: {
		name: 'The Ceremony',
		venue: 'Kingdom Hall of Jehovah\'s Witnesses, Tanza, Cavite, Philippines',
		address: 'Tanza, Cavite, Philippines'
	},

	reception: {
		name: 'The Reception',
		venue: 'Rio Delta',
		address: 'Tanza, Cavite, Philippines'
	},

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
		/**
		 * Shown to guests, and checked against `wedding.start` in
		 * `wedding.test.ts` because this value has been *after* the ceremony
		 * before.
		 *
		 * MUST match the `isBeforeCutoff()` timestamp in the deployed ruleset,
		 * which lives in the Firebase console and not in this repo — so there is
		 * no file here to diff against, and nothing keeps the two in step except
		 * whoever changes them. Confirm the real cutoff with the couple.
		 */
		deadline: '15 January 2027',

		/**
		 * The invitation message, one line per paragraph break.
		 *
		 * Moved out of `rsvp/message.ts` so the couple can reword the whole thing
		 * without touching code, which is what every other piece of copy in this
		 * file is for. `{...}` tokens are substituted with the household's own
		 * details — `{household}`, `{names}`, `{deadline}`, `{link}`, `{code}` and
		 * `{seats}` — and `{seats}` carries its noun, so "2 seats" and "1 seat" both
		 * read correctly without the plural living in the copy.
		 *
		 * `deadline` above is a separate value because it is also the cutoff the
		 * deployed ruleset enforces by hand; this is only what a guest is told.
		 *
		 * A household with its own message ignores all of this — see
		 * `InvitationInput.custom`.
		 */
		invitation: {
			greeting: 'Hi {household}!',
			invitation: '{names} are getting married and would be honoured by your presence.',
			deadline: 'Kindly reply by {deadline}.',
			access: 'Your invitation: {link}',
			code: 'Your code: {code} — {seats} reserved for you.'
		},

		/**
		 * Where a guest goes when their code does not work — which will happen,
		 * because codes are read off cards and typed on phones. Empty rather than
		 * a placeholder mailbox, so the flow renders the name as plain text instead
		 * of a `mailto:` that bounces.
		 */
		contact: 'to be announced',
		contactEmail: '',

		/** Dead — RSVPs go to Firestore through src/lib/rsvp/ now. */
		endpoint: 'https://formspree.io/f/YOUR-FORM-ID'
	},

	registry: [
		{ name: 'Placeholder Registry One', url: 'https://example.com/registry-1' },
		{ name: 'Placeholder Registry Two', url: 'https://example.com/registry-2' }
	]
} as const;
