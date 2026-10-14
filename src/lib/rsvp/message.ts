import { wedding } from '../lib/wedding.ts';

/** What a household needs before an invitation can be written for it. */
export interface InvitationInput {
	/** Shown to the guest as "Hi ___". The household name as the couple typed it. */
	household: string;

	seats: number;
	code: string;

	/**
	 * Where the link points, with no trailing slash.
	 *
	 * Passed in rather than read here because the two callers legitimately know
	 * different answers: the seed script reads `static/CNAME`, and the dashboard
	 * knows the origin it is being served on. Those differ in preview, and the
	 * link has to be the one that actually works.
	 */
	site: string;

	/**
	 * This household's own wording, replacing the shared template entirely.
	 *
	 * Blank means the template in `wedding.ts`, which is what every household gets
	 * by default. Set for the ones the couple wants to word differently — an aunt
	 * they are fond of, a colleague who needs the formality spelled out.
	 *
	 * A full replacement rather than a greeting or a sign-off, because a partial
	 * one has to guess what the rest should say and there is no second place to
	 * notice when the guess is wrong. The couple writes the whole message or none
	 * of it.
	 */
	custom?: string;
}

/**
 * The longest a custom message may be.
 *
 * Generous for a text message — this is pasted into Messenger or read on a phone —
 * and small enough that a pasted essay cannot make the dashboard unpleasant to
 * open. Firestore would allow a megabyte; the thing being protected here is the
 * couple's own screen.
 */
export const MAX_CUSTOM_MESSAGE = 2000;

/**
 * Fills `{token}` from the supplied values.
 *
 * An unrecognised token is left exactly as written rather than replaced with an
 * empty string. A typo should be visible in the preview and in the message they
 * send, not silently swallow a word — and a template containing braces that are
 * not ours at all must survive untouched.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, token: string) =>
		token in values ? values[token] : match
	);
}

/** The link a household is sent, matching what `RsvpFlow` reads back. */
export function invitationLink(site: string, code: string): string {
	return `${site.replace(/\/$/, '')}/?code=${code}`;
}

/**
 * The message a household is sent.
 *
 * Shared by the seed script, the dashboard's receipt and its detail panel so the
 * three cannot drift. This is text that gets pasted into Messenger and read by a
 * guest, so a version that disagrees about the names, the deadline or the seat
 * count is worse than a wrong number anywhere else — there is no second place to
 * notice it.
 *
 * The wording itself comes from `wedding.rsvp.invitation` rather than from here,
 * so the couple can reword it without editing code.
 */
export function invitationMessage({ household, seats, code, site, custom }: InvitationInput): string {
	const values = {
		household,
		names: wedding.names,
		deadline: wedding.rsvp.deadline,
		code,
		link: invitationLink(site, code),

		// Carries its own noun so the copy reads "2 seats" and "1 seat" without the
		// plural having to live in a template the couple is editing.
		seats: `${seats} ${seats === 1 ? 'seat' : 'seats'}`
	};

	const { greeting, invitation, deadline, access, code: codeLine } = wedding.rsvp.invitation;

	const own = custom?.trim();

	if (own) return withAccess(renderTemplate(own, values), values);

	return (
		`${renderTemplate(greeting, values)}\n\n` +
		`${renderTemplate(invitation, values)}\n` +
		`${renderTemplate(deadline, values)}\n\n` +
		`${renderTemplate(access, values)}\n` +
		renderTemplate(codeLine, values)
	);
}

/**
 * Guarantees the message contains a way to RSVP.
 *
 * A custom message is the couple's own words, and they can leave the link out —
 * but an invitation without a link is not an invitation, and the failure is
 * invisible until a guest messages asking what the link was. So the access block
 * is re-attached unless their text already contains the link, which is the one
 * thing that makes the message work.
 *
 * Only the link. The deadline, the seat count and the code are the couple's to
 * write or leave out — overwriting those would make "custom" a lie.
 */
function withAccess(text: string, values: Record<string, string>): string {
	if (text.includes(values.link)) return text;

	const { access, code } = wedding.rsvp.invitation;

	return `${text}\n\n${renderTemplate(access, values)}\n${renderTemplate(code, values)}`;
}