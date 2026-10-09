/*
 * The faces the invitation can use, in one place.
 *
 * Every `family` here must be backed by an `@import` in `src/lib/fonts.css`,
 * which the /fonts/ gallery pulls in. Adding a face is three steps: install the
 * @fontsource package, add the import, add an entry below.
 */
export interface FontEntry {
	/** Must match the `font-family` in the family's @font-face. */
	family: string;

	label: string;

	note: string;

	/** The job this face does today. Left off for candidates. */
	usage?: string;
}

/** Faces the invitation is built from. */
export const systemFonts: FontEntry[] = [
	{
		family: 'Cormorant Garamond Variable',
		label: 'Cormorant Garamond',
		note: 'Dates, venues, section headings. Also the fallback face for the names.',
		usage: 'display'
	},
	{
		family: 'Montserrat Variable',
		label: 'Montserrat',
		note: 'Small uppercase labels, countdown, form controls.',
		usage: 'body'
	},
	{
		family: 'Cormorant SC',
		label: 'Cormorant SC',
		note: 'Small caps. Held onto as the face the hero names used to be set in.'
	}
];

/** Script faces, with the hero names rendered in each so they can be compared in place. */
export const scriptFonts: FontEntry[] = [
	{
		family: 'Pinyon Script',
		label: 'Pinyon Script',
		note: 'High contrast copperplate. The stand-in for the commercial Abramo Script.',
		usage: 'hero names'
	},
	{
		family: 'Petit Formal Script',
		label: 'Petit Formal Script',
		note: 'Most legible of the set, and much wider, so it carries more weight on a phone.'
	},
	{
		family: 'Allura',
		label: 'Allura',
		note: 'Softer and rounder than the formal scripts. Friendlier, a little less formal.'
	},
	{
		family: 'Monsieur La Doulaise',
		label: 'Monsieur La Doulaise',
		note: 'Swashed capitals. Dramatic, and it crowds the kicker on narrow screens.'
	},
	{
		family: 'Great Vibes',
		label: 'Great Vibes',
		note: 'The classic wedding script. Familiar, which can read as clipart.'
	},
	{
		family: 'Italianno',
		label: 'Italianno',
		note: 'Tall and narrow with very fine hairlines. Faint on ivory at small sizes.'
	},
	{
		family: 'Ephesis',
		label: 'Ephesis',
		note: 'Very low contrast. Borderline legible against the ivory background.'
	},
	{
		family: 'Tangerine',
		label: 'Tangerine',
		note: 'Hairline weight. The faintest here, and the least readable at hero scale.'
	},
	{
		family: 'Sacramento',
		label: 'Sacramento',
		note: 'Monoline and casual. Reads as friendly rather than formal.'
	},
	{
		family: 'Parisienne',
		label: 'Parisienne',
		note: 'Brushy. Closer to signage than to calligraphy.'
	}
];
